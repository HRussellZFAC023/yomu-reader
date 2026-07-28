import type { DonationCurrency } from "../../shared/donation-currencies";

export type AcademyPaymentEnvelope =
  | {
      readonly schemaVersion: 1;
      readonly provider: "stripe" | "kofi";
      readonly eventId: string;
      readonly eventType: "charge.settled";
      readonly occurredAt: number;
      readonly subject: {
        readonly kind: "academy_purchase" | "transaction";
        readonly reference: string;
      };
      readonly transaction: {
        readonly reference: string;
        readonly sessionReference?: string;
        readonly claimHash?: string;
        readonly currency: DonationCurrency;
        readonly amountMinor: number;
      };
      readonly purchaseId?: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly provider: "patreon";
      readonly eventId: string;
      readonly eventType: "membership.active" | "membership.revoked";
      readonly occurredAt: number;
      readonly subject: {
        readonly kind: "member";
        readonly reference: string;
      };
      readonly entitlement?: {
        readonly expiresAt: number;
        readonly qualifyingAmountMinor: number;
      };
    };

export interface AcademyPaymentIngressService {
  fetch(request: Request): Promise<Response>;
}

export interface AcademyBridgeEnv {
  ACADEMY_PAYMENT_INGRESS?: AcademyPaymentIngressService;
  PAYMENT_INGRESS_TOKEN?: string;
}

export interface AcademyPaymentClaim {
  readonly provider: "stripe";
  readonly transactionReference: string;
  readonly claimToken: string;
}

export type AcademyPaymentDeliveryStatus =
  | "pending"
  | "leased"
  | "retry"
  | "email_accepted"
  | "manual_required"
  | "not_applicable"
  | "expired"
  | "redeemed"
  | "revoked"
  | "stale";

export interface AcademyPaymentIngressResult {
  readonly outcome: "applied" | "duplicate" | "stale";
  readonly deliveryStatus: AcademyPaymentDeliveryStatus;
  readonly deliveryId: string | null;
}

/**
 * The bridge fails closed until both the private Service binding and its
 * independent bearer credential are configured. Provider handlers call this
 * only after authenticating the original webhook.
 */
export async function forwardAcademyPayment(
  env: AcademyBridgeEnv,
  envelope: AcademyPaymentEnvelope | null,
): Promise<AcademyPaymentIngressResult | null> {
  if (!envelope) return null;
  const service = env.ACADEMY_PAYMENT_INGRESS;
  const token = env.PAYMENT_INGRESS_TOKEN?.trim();
  if (!service || !token) throw new Error("Academy payment ingestion is not configured.");

  let response: Response;
  try {
    response = await service.fetch(new Request("https://yomu-academy.internal/academy/internal/payment-ingress", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(envelope),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "yomu_support_academy_ingress_failed",
      provider: envelope.provider,
      reason: error instanceof Error ? error.message : "service-binding-error",
    }));
    throw new Error("Academy payment ingestion failed.");
  }

  const result = await response.json().catch(() => null);
  const parsedResult = parseIngressResult(response.status, result);
  if (parsedResult?.outcome === "stale") {
    console.warn(JSON.stringify({
      event: "yomu_support_academy_ingress_stale",
      provider: envelope.provider,
      status: response.status,
      reason: "stale",
    }));
    return parsedResult;
  }
  if (parsedResult) return parsedResult;

  console.error(JSON.stringify({
    event: "yomu_support_academy_ingress_rejected",
    provider: envelope.provider,
    status: response.status,
    reason: response.status === 200 || response.status === 202 ? "invalid-response-body" : "http-error",
  }));
  throw new Error("Academy payment ingestion failed.");
}

/** Redeem only a browser secret that was committed into a verified payment. */
export async function claimAcademyPayment(
  env: AcademyBridgeEnv,
  claim: AcademyPaymentClaim,
): Promise<Response> {
  const service = env.ACADEMY_PAYMENT_INGRESS;
  const token = env.PAYMENT_INGRESS_TOKEN?.trim();
  if (!service || !token) throw new Error("Academy payment ingestion is not configured.");
  return service.fetch(new Request("https://yomu-academy.internal/academy/internal/payment-claim", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(claim),
  }));
}

function parseIngressResult(status: number, value: unknown): AcademyPaymentIngressResult | null {
  if (!isRecord(value) || value.received !== true || "code" in value) return null;
  if (status === 202 && isStaleIngressResult(value)) {
    return { outcome: "stale", deliveryStatus: "stale", deliveryId: null };
  }
  if (status !== 200) return null;

  const outcome = value.applied === true && value.duplicate !== true
    ? "applied"
    : value.duplicate === true && value.applied !== true
      ? "duplicate"
      : null;
  const deliveryStatus = readDeliveryStatus(value.deliveryStatus);
  if (!outcome || !deliveryStatus) return null;

  const needsDeliveryId = new Set<AcademyPaymentDeliveryStatus>([
    "pending",
    "leased",
    "retry",
    "email_accepted",
    "manual_required",
  ]).has(deliveryStatus);
  const deliveryId = typeof value.deliveryId === "string"
    && /^paydel_[a-f0-9]{40}$/u.test(value.deliveryId)
    ? value.deliveryId
    : null;
  if (needsDeliveryId !== (deliveryId !== null)) return null;
  return { outcome, deliveryStatus, deliveryId };
}

function isStaleIngressResult(value: unknown): value is { readonly reason: "stale" } {
  return isRecord(value)
    && value.received === true
    && value.applied === false
    && value.reason === "stale";
}

function readDeliveryStatus(value: unknown): AcademyPaymentDeliveryStatus | null {
  if (
    value === "pending"
    || value === "leased"
    || value === "retry"
    || value === "email_accepted"
    || value === "manual_required"
    || value === "not_applicable"
    || value === "expired"
    || value === "redeemed"
    || value === "revoked"
    || value === "stale"
  ) return value;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function stablePatreonEventId(trigger: string, rawBody: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${trigger}\n${rawBody}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `patreon_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
