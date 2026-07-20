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
        readonly currency: "gbp";
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

/**
 * The bridge fails closed until both the private Service binding and its
 * independent bearer credential are configured. Provider handlers call this
 * only after authenticating the original webhook.
 */
export async function forwardAcademyPayment(
  env: AcademyBridgeEnv,
  envelope: AcademyPaymentEnvelope | null,
): Promise<"irrelevant" | "accepted"> {
  if (!envelope) return "irrelevant";
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
  if (response.status === 202 && isStaleIngressResult(result)) {
    console.warn(JSON.stringify({
      event: "yomu_support_academy_ingress_stale",
      provider: envelope.provider,
      status: response.status,
      reason: result.reason,
    }));
    return "accepted";
  }
  if (response.status === 200 && isAcceptedIngressResult(result)) return "accepted";

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

function isAcceptedIngressResult(value: unknown): boolean {
  if (!isRecord(value) || value.received !== true) return false;
  return value.applied === true || value.duplicate === true;
}

function isStaleIngressResult(value: unknown): value is { readonly reason: "stale" } {
  return isRecord(value)
    && value.received === true
    && value.applied === false
    && value.reason === "stale";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function stablePatreonEventId(trigger: string, rawBody: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${trigger}\n${rawBody}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `patreon_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
