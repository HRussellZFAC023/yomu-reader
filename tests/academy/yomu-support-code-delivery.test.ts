// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AcademyCodeDeliveryError,
  deliverAcademyCode,
  reconcileAcademyCodeDeliveries,
  type AcademyCodeDeliveryLogger,
  type AcademyCodeDeliveryService,
  type AcademyCodeEmailBinding,
  type AcademyCodeEmailMessage,
  type AcademyCodeProvider,
} from "../../workers/yomu-support/src/academy-code-delivery";

const NOW = 1_775_000_000_000;
const CODE = "ABCD-EFGH-JKMP-QRST";
const LEASE_TOKEN = "l".repeat(43);
const PAYMENT_INGRESS_TOKEN = "test-payment-ingress-token";
const OWNER_EMAIL = "owner@example.com";
const DELIVERY_A = `paydel_${"a".repeat(40)}`;
const DELIVERY_B = `paydel_${"b".repeat(40)}`;
const DELIVERY_C = `paydel_${"c".repeat(40)}`;

describe("Support-owned Academy code delivery client", () => {
  it("sends the provider email once without matching a Google identity", async () => {
    const academy = new FakeAcademyService({
      deliveryId: DELIVERY_A,
      provider: "stripe",
      status: "pending",
    });
    const outbound = collectingEmail();
    const env = deliveryEnv(academy, outbound.binding);

    await expect(deliverAcademyCode(env, {
      provider: "stripe",
      deliveryId: DELIVERY_A,
      email: "platform-payer@Example.COM",
      now: NOW,
    })).resolves.toBe("email-accepted");

    expect(outbound.messages).toHaveLength(1);
    const message = outbound.messages[0]!;
    expect(message).toMatchObject({
      to: "platform-payer@example.com",
      from: {
        email: "academy@notifications.yomureader.com",
        name: "よむ Academy",
      },
      subject: "Your よむ Academy code / よむ Academy コード",
    });
    expect(message.text).toContain("Your payment is complete.");
    expect(message.text).toContain("ご支援ありがとうございます。");
    expect(message.text).toContain("within 30 days of payment");
    expect(message.text).toContain("支払いから30日以内");
    expect(message.text).toContain("Google account you choose");
    expect(message.text).toContain(CODE);
    expect(message.html).toContain(`<code>${CODE}</code>`);
    expect(academy.delivery.status).toBe("email_accepted");
    expect(academy.completions).toEqual([
      expect.objectContaining({
        deliveryId: DELIVERY_A,
        leaseToken: LEASE_TOKEN,
        outcome: "email_accepted",
      }),
    ]);

    // The Academy service receives only the opaque delivery lease. It has no
    // provider address or Google address to compare.
    expect(JSON.stringify(academy.requests)).not.toContain("@");

    await expect(deliverAcademyCode(env, {
      provider: "stripe",
      deliveryId: DELIVERY_A,
      email: "platform-payer@example.com",
      now: NOW + 1,
    })).resolves.toBe("already-complete");
    expect(outbound.messages).toHaveLength(1);
    expect(academy.completions).toHaveLength(1);
  });

  it("does not send when Academy reports a terminal delivery", async () => {
    const academy = new FakeAcademyService({
      deliveryId: DELIVERY_A,
      provider: "kofi",
      status: "email_accepted",
    });
    const outbound = collectingEmail();

    await expect(deliverAcademyCode(deliveryEnv(academy, outbound.binding), {
      provider: "kofi",
      deliveryId: DELIVERY_A,
      email: "payer@example.com",
      now: NOW,
    })).resolves.toBe("already-complete");

    expect(outbound.messages).toHaveLength(0);
    expect(academy.completions).toHaveLength(0);
  });

  it("sends a missing-address code to the owner and records manual delivery", async () => {
    const academy = new FakeAcademyService({
      deliveryId: DELIVERY_B,
      provider: "patreon",
      status: "pending",
    });
    const outbound = collectingEmail();
    const logger = collectingLogger();

    await expect(deliverAcademyCode(
      deliveryEnv(academy, outbound.binding, OWNER_EMAIL),
      {
        provider: "patreon",
        deliveryId: DELIVERY_B,
        email: null,
        now: NOW,
        logger,
      },
    )).resolves.toBe("manual-required");

    expect(outbound.messages).toHaveLength(1);
    expect(outbound.messages[0]).toMatchObject({
      to: OWNER_EMAIL,
      from: {
        email: "academy@notifications.yomureader.com",
        name: "よむ Academy",
      },
      subject: "よむ Academy code needs manual delivery / コードの手動送信",
    });
    expect(outbound.messages[0]?.text).toContain(CODE);
    expect(outbound.messages[0]?.text).toContain("within 30 days of payment");
    expect(outbound.messages[0]?.text).toContain("支払いから30日以内");
    expect(academy.delivery.status).toBe("manual_required");
    expect(academy.completions).toEqual([
      expect.objectContaining({
        deliveryId: DELIVERY_B,
        outcome: "manual_required",
      }),
    ]);
    expect(logger.messages).toHaveLength(1);
    expect(JSON.parse(logger.messages[0]!)).toEqual({
      event: "yomu_support_academy_code_delivery_attention",
      provider: "patreon",
      deliveryId: DELIVERY_B,
      reason: "missing_recipient",
    });
    expect(logger.messages.join("\n")).not.toContain(CODE);
    expect(logger.messages.join("\n")).not.toContain(OWNER_EMAIL);
  });

  it("keeps a missing-address delivery retryable until owner handoff is configured", async () => {
    const academy = new FakeAcademyService({
      deliveryId: DELIVERY_B,
      provider: "patreon",
      status: "pending",
    });
    const outbound = collectingEmail();
    const logger = collectingLogger();

    await expect(deliverAcademyCode(
      deliveryEnv(academy, outbound.binding),
      {
        provider: "patreon",
        deliveryId: DELIVERY_B,
        email: null,
        now: NOW,
        logger,
      },
    )).rejects.toMatchObject({
      name: "AcademyCodeDeliveryError",
      reason: "owner_alert_unconfigured",
      retryable: true,
    } satisfies Partial<AcademyCodeDeliveryError>);

    expect(outbound.messages).toHaveLength(0);
    expect(academy.delivery.status).toBe("retry");
    expect(academy.completions).toEqual([
      expect.objectContaining({
        deliveryId: DELIVERY_B,
        outcome: "retry",
        retryAt: NOW + 5 * 60_000,
      }),
    ]);
    expect(logger.messages.join("\n")).not.toContain(CODE);
  });

  it.each([
    { label: "surrounding whitespace", address: " payer@example.com" },
    { label: "display-name syntax", address: "Payer <payer@example.com>" },
    { label: "header injection", address: "payer@example.com\r\nBcc:other@example.com" },
    { label: "multiple mailboxes", address: "payer@example.com,other@example.com" },
    { label: "multiple separators", address: "payer@example.com@other.example" },
    { label: "local-part whitespace", address: "payer name@example.com" },
    { label: "undotted domain", address: "payer@example" },
    { label: "invalid domain label", address: "payer@-example.com" },
    { label: "one-character public suffix", address: "payer@example.c" },
    { label: "non-ASCII raw address", address: "påyer@example.com" },
    { label: "oversized address", address: `${"a".repeat(245)}@example.com` },
  ])("rejects $label before the Email binding sees it", async ({ address }) => {
    const academy = new FakeAcademyService({
      deliveryId: DELIVERY_C,
      provider: "kofi",
      status: "pending",
    });
    const outbound = collectingEmail();
    const logger = collectingLogger();

    await expect(deliverAcademyCode(
      deliveryEnv(academy, outbound.binding, OWNER_EMAIL),
      {
        provider: "kofi",
        deliveryId: DELIVERY_C,
        email: address,
        now: NOW,
        logger,
      },
    )).resolves.toBe("manual-required");

    expect(outbound.messages).toHaveLength(1);
    expect(outbound.messages[0]?.to).toBe(OWNER_EMAIL);
    expect(outbound.messages[0]?.text).toContain(CODE);
    expect(academy.delivery.status).toBe("manual_required");
    expect(academy.completions.at(-1)).toEqual(expect.objectContaining({
      outcome: "manual_required",
    }));
    const logs = logger.messages.join("\n");
    expect(logs).not.toContain(address);
    expect(logs).not.toContain(OWNER_EMAIL);
    expect(logs).not.toContain(CODE);
  });

  it("releases a transient Email failure for retry without logging private data", async () => {
    const academy = new FakeAcademyService({
      deliveryId: DELIVERY_A,
      provider: "stripe",
      status: "pending",
    });
    const privateFailure = Object.assign(
      new Error("provider response for retry-payer@example.com"),
      { code: "E_RATE_LIMIT_EXCEEDED" },
    );
    const outbound = collectingEmail(privateFailure);
    const logger = collectingLogger();

    await expect(deliverAcademyCode(deliveryEnv(academy, outbound.binding), {
      provider: "stripe",
      deliveryId: DELIVERY_A,
      email: "retry-payer@example.com",
      now: NOW,
      logger,
    })).rejects.toMatchObject({
      name: "AcademyCodeDeliveryError",
      reason: "E_RATE_LIMIT_EXCEEDED",
      retryable: true,
    } satisfies Partial<AcademyCodeDeliveryError>);

    expect(outbound.messages).toHaveLength(1);
    expect(academy.delivery.status).toBe("retry");
    expect(academy.completions).toEqual([
      expect.objectContaining({
        deliveryId: DELIVERY_A,
        outcome: "retry",
        retryAt: NOW + 5 * 60_000,
      }),
    ]);
    const logs = logger.messages.join("\n");
    expect(logs).not.toContain("retry-payer@example.com");
    expect(logs).not.toContain(CODE);
    expect(logs).not.toContain(privateFailure.message);
  });

  it("reconciles one stale delivery through the owner without a redundant aggregate", async () => {
    const academy = new FakeAcademyService({
      deliveryId: DELIVERY_B,
      provider: "patreon",
      status: "pending",
      updatedAt: NOW - 2 * 60_000,
    });
    const outbound = collectingEmail();
    const logger = collectingLogger();

    await expect(reconcileAcademyCodeDeliveries(
      deliveryEnv(academy, outbound.binding, OWNER_EMAIL),
      {
        now: NOW,
        staleAfterMs: 60_000,
        logger,
      },
    )).resolves.toEqual({
      stale: 1,
      pending: 1,
      retry: 0,
      manualRequired: 0,
      leased: 0,
      ownerAlertAccepted: false,
      manualCodeAccepted: true,
    });

    expect(outbound.messages).toHaveLength(1);
    expect(outbound.messages[0]).toMatchObject({
      to: OWNER_EMAIL,
      subject: "よむ Academy code needs manual delivery / コードの手動送信",
    });
    expect(outbound.messages[0]?.text).toContain(CODE);
    expect(outbound.messages[0]?.subject).not.toContain("配信アラート");
    expect(academy.delivery.status).toBe("manual_required");
    expect(academy.completions).toEqual([
      expect.objectContaining({
        deliveryId: DELIVERY_B,
        outcome: "manual_required",
      }),
    ]);
    expect(logger.messages.map(message => JSON.parse(message))).toEqual([{
      event: "yomu_support_academy_delivery_attention",
      total: 1,
      pending: 1,
      retry: 0,
      manualRequired: 0,
      leased: 0,
    }]);
  });

  it("reports a manual-only backlog by count without emailing it again", async () => {
    const academy = new FakeAcademyService({
      deliveryId: DELIVERY_C,
      provider: "patreon",
      status: "manual_required",
      updatedAt: NOW - 2 * 60_000,
    });
    const outbound = collectingEmail();
    const logger = collectingLogger();
    const env = deliveryEnv(academy, outbound.binding, OWNER_EMAIL);

    await expect(reconcileAcademyCodeDeliveries(env, {
      now: NOW,
      staleAfterMs: 60_000,
      logger,
    })).resolves.toMatchObject({
      stale: 1,
      manualRequired: 1,
      ownerAlertAccepted: false,
      manualCodeAccepted: false,
    });
    await expect(reconcileAcademyCodeDeliveries(env, {
      now: NOW + 1,
      staleAfterMs: 60_000,
      logger,
    })).resolves.toMatchObject({
      stale: 1,
      manualRequired: 1,
      ownerAlertAccepted: false,
      manualCodeAccepted: false,
    });

    expect(outbound.messages).toHaveLength(0);
    expect(academy.completions).toHaveLength(0);
    expect(logger.messages).toHaveLength(2);
    for (const message of logger.messages) {
      expect(JSON.parse(message)).toEqual({
        event: "yomu_support_academy_delivery_attention",
        total: 1,
        pending: 0,
        retry: 0,
        manualRequired: 1,
        leased: 0,
      });
      expect(message).not.toContain(DELIVERY_C);
      expect(message).not.toContain(CODE);
      expect(message).not.toContain(OWNER_EMAIL);
    }
  });
});

type FakeDeliveryStatus =
  | "pending"
  | "leased"
  | "retry"
  | "email_accepted"
  | "manual_required";

interface FakeDelivery {
  readonly deliveryId: string;
  readonly provider: AcademyCodeProvider;
  status: FakeDeliveryStatus;
  attemptCount: number;
  availableAt: number;
  updatedAt: number;
  leaseToken: string | null;
}

class FakeAcademyService implements AcademyCodeDeliveryService {
  readonly delivery: FakeDelivery;
  readonly requests: Array<{ readonly path: string; readonly body: Record<string, unknown> }> = [];
  readonly completions: Array<Record<string, unknown>> = [];

  constructor(input: {
    readonly deliveryId: string;
    readonly provider: AcademyCodeProvider;
    readonly status: FakeDeliveryStatus;
    readonly updatedAt?: number;
  }) {
    this.delivery = {
      ...input,
      attemptCount: 0,
      availableAt: input.updatedAt ?? NOW - 1,
      updatedAt: input.updatedAt ?? NOW - 1,
      leaseToken: null,
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${PAYMENT_INGRESS_TOKEN}`) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const path = new URL(request.url).pathname;
    const body = await request.json() as Record<string, unknown>;
    this.requests.push({ path, body });

    if (path === "/academy/internal/payment-delivery-claim") {
      return this.claim(body);
    }
    if (path === "/academy/internal/payment-delivery-complete") {
      return this.complete(body);
    }
    if (path === "/academy/internal/payment-delivery-pending") {
      return this.pending(body);
    }
    return jsonResponse({ error: "not-found" }, 404);
  }

  private claim(body: Record<string, unknown>): Response {
    if (body.deliveryId !== this.delivery.deliveryId) {
      return jsonResponse({ error: "not-found" }, 404);
    }
    if (
      this.delivery.status === "email_accepted"
      || this.delivery.status === "manual_required"
    ) {
      return jsonResponse({
        status: this.delivery.status,
        deliveryId: this.delivery.deliveryId,
      });
    }
    if (
      typeof body.staleBefore === "number"
      && this.delivery.updatedAt > body.staleBefore
    ) {
      return jsonResponse({
        status: this.delivery.status,
        deliveryId: this.delivery.deliveryId,
      }, 202);
    }

    this.delivery.status = "leased";
    this.delivery.attemptCount += 1;
    this.delivery.leaseToken = LEASE_TOKEN;
    return jsonResponse({
      status: "claimed",
      deliveryId: this.delivery.deliveryId,
      leaseToken: LEASE_TOKEN,
      code: CODE,
    });
  }

  private complete(body: Record<string, unknown>): Response {
    if (
      body.deliveryId !== this.delivery.deliveryId
      || body.leaseToken !== this.delivery.leaseToken
      || (
        body.outcome !== "email_accepted"
        && body.outcome !== "manual_required"
        && body.outcome !== "retry"
      )
    ) {
      return jsonResponse({ error: "conflict" }, 409);
    }
    this.completions.push({ ...body });
    this.delivery.status = body.outcome;
    this.delivery.leaseToken = null;
    if (body.outcome === "retry" && typeof body.retryAt === "number") {
      this.delivery.availableAt = body.retryAt;
    }
    return jsonResponse({
      deliveryId: this.delivery.deliveryId,
      status: body.outcome,
    });
  }

  private pending(body: Record<string, unknown>): Response {
    const staleBefore = Number(body.staleBefore);
    const isActionable = (
      this.delivery.status === "pending"
      || this.delivery.status === "retry"
      || this.delivery.status === "manual_required"
      || this.delivery.status === "leased"
    ) && this.delivery.updatedAt <= staleBefore;
    const deliveries = isActionable
      ? [{
          deliveryId: this.delivery.deliveryId,
          provider: this.delivery.provider,
          status: this.delivery.status,
          attemptCount: this.delivery.attemptCount,
          availableAt: this.delivery.availableAt,
          updatedAt: this.delivery.updatedAt,
        }]
      : [];
    return jsonResponse({
      staleBefore,
      count: deliveries.length,
      deliveries,
    });
  }
}

function deliveryEnv(
  academy: AcademyCodeDeliveryService,
  email: AcademyCodeEmailBinding,
  ownerEmail?: string,
) {
  return {
    ACADEMY_PAYMENT_INGRESS: academy,
    PAYMENT_INGRESS_TOKEN,
    ACADEMY_CODE_EMAIL: email,
    ...(ownerEmail ? { ACADEMY_DELIVERY_ALERT_EMAIL: ownerEmail } : {}),
  };
}

function collectingEmail(failure?: unknown): {
  readonly binding: AcademyCodeEmailBinding;
  readonly messages: AcademyCodeEmailMessage[];
} {
  const messages: AcademyCodeEmailMessage[] = [];
  return {
    messages,
    binding: {
      async send(message) {
        messages.push(message);
        if (failure) throw failure;
        return { messageId: "accepted-by-email-service" };
      },
    },
  };
}

function collectingLogger(): AcademyCodeDeliveryLogger & { readonly messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    error(message) {
      messages.push(message);
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
