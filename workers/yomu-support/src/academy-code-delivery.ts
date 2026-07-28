import type {
  AcademyBridgeEnv,
  AcademyPaymentIngressService,
} from "./academy-bridge";

const ACADEMY_URL = "https://yomureader.com/academy/";
const ACADEMY_INTERNAL_ORIGIN = "https://yomu-academy.internal";
const CODE_SENDER = {
  email: "academy@notifications.yomureader.com",
  name: "よむ Academy",
} as const;
const DELIVERY_ID_PATTERN = /^paydel_[a-f0-9]{40}$/u;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const INVITE_CODE_PATTERN = /^[A-Z0-9-]{7,64}$/u;
const DEFAULT_RETRY_DELAY_MS = 5 * 60_000;
const DEFAULT_STALE_AFTER_MS = 15 * 60_000;
const DEFAULT_RECONCILIATION_LIMIT = 50;
const MAX_RECONCILIATION_LIMIT = 100;
const KNOWN_EMAIL_ERROR_CODES = new Set([
  "E_VALIDATION_ERROR",
  "E_FIELD_MISSING",
  "E_TOO_MANY_RECIPIENTS",
  "E_SENDER_NOT_VERIFIED",
  "E_RECIPIENT_NOT_ALLOWED",
  "E_RECIPIENT_SUPPRESSED",
  "E_SENDER_DOMAIN_NOT_AVAILABLE",
  "E_CONTENT_TOO_LARGE",
  "E_RATE_LIMIT_EXCEEDED",
  "E_DAILY_LIMIT_EXCEEDED",
  "E_DELIVERY_FAILED",
  "E_INTERNAL_SERVER_ERROR",
  "E_HEADER_NOT_ALLOWED",
  "E_HEADER_USE_API_FIELD",
  "E_HEADER_VALUE_INVALID",
  "E_HEADER_VALUE_TOO_LONG",
  "E_HEADER_NAME_INVALID",
  "E_HEADERS_TOO_LARGE",
  "E_HEADERS_TOO_MANY",
]);
const RETRYABLE_EMAIL_ERROR_CODES = new Set([
  "E_SENDER_NOT_VERIFIED",
  "E_SENDER_DOMAIN_NOT_AVAILABLE",
  "E_RATE_LIMIT_EXCEEDED",
  "E_DAILY_LIMIT_EXCEEDED",
  "E_DELIVERY_FAILED",
  "E_INTERNAL_SERVER_ERROR",
  "email_send_failed",
]);

export type AcademyCodeProvider = "stripe" | "kofi" | "patreon";
export type AcademyCodeDeliveryResult =
  | "email-accepted"
  | "already-complete"
  | "manual-required";

export interface AcademyCodeEmailMessage {
  readonly to: string;
  readonly from: {
    readonly email: string;
    readonly name: string;
  };
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Structural subset of Cloudflare's generated SendEmail binding. */
export interface AcademyCodeEmailBinding {
  send(message: AcademyCodeEmailMessage): Promise<unknown>;
}

/** Structural subset shared by a Worker Service binding and test doubles. */
export type AcademyCodeDeliveryService = AcademyPaymentIngressService;

export interface AcademyCodeDeliveryEnv extends AcademyBridgeEnv {
  readonly ACADEMY_CODE_EMAIL?: AcademyCodeEmailBinding;
  readonly ACADEMY_DELIVERY_ALERT_EMAIL?: string;
}

export interface AcademyCodeDeliveryLogger {
  error(message: string): void;
}

export interface DeliverAcademyCodeInput {
  readonly provider: AcademyCodeProvider;
  readonly deliveryId: string;
  readonly email?: string | null;
  readonly now?: number;
  readonly logger?: AcademyCodeDeliveryLogger;
}

export interface ReconcileAcademyCodeDeliveriesInput {
  readonly now?: number;
  readonly staleAfterMs?: number;
  readonly limit?: number;
  readonly logger?: AcademyCodeDeliveryLogger;
}

export interface AcademyCodeDeliveryReconciliation {
  readonly stale: number;
  readonly pending: number;
  readonly retry: number;
  readonly manualRequired: number;
  readonly leased: number;
  readonly ownerAlertAccepted: boolean;
  readonly manualCodeAccepted: boolean;
}

export class AcademyCodeDeliveryError extends Error {
  constructor(
    readonly reason: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super("Academy code delivery failed.", options);
    this.name = "AcademyCodeDeliveryError";
  }
}

interface ClaimedDelivery {
  readonly status: "claimed";
  readonly deliveryId: string;
  readonly leaseToken: string;
  readonly code: string;
}

type TerminalDelivery =
  | { readonly status: "email_accepted"; readonly deliveryId: string }
  | { readonly status: "manual_required"; readonly deliveryId: string };

interface PendingDelivery {
  readonly deliveryId: string;
  readonly provider: AcademyCodeProvider;
  readonly status: "pending" | "retry" | "manual_required" | "leased";
  readonly attemptCount: number;
  readonly availableAt: number;
  readonly updatedAt: number;
}

interface PendingDeliveryResponse {
  readonly staleBefore: number;
  readonly count: number;
  readonly deliveries: readonly PendingDelivery[];
}

/**
 * Claims one named Academy delivery and sends its code without retaining the
 * recipient or code. Cloudflare accepting the message is recorded accurately
 * as `email_accepted`; it is not treated as proof of inbox delivery.
 */
export async function deliverAcademyCode(
  env: AcademyCodeDeliveryEnv,
  input: DeliverAcademyCodeInput,
): Promise<AcademyCodeDeliveryResult> {
  const provider = readProvider(input.provider);
  const deliveryId = readDeliveryId(input.deliveryId);
  const now = readNow(input.now);
  const logger = input.logger ?? console;
  const recipient = normalizeRecipientEmail(input.email);
  const claim = await claimAcademyDelivery(env, deliveryId);

  if (claim.status === "email_accepted") return "already-complete";
  if (claim.status === "manual_required") return "manual-required";

  if (!recipient) {
    const reason = input.email?.trim() ? "invalid_recipient" : "missing_recipient";
    const accepted = await sendOwnerManualNotice(env, {
      provider,
      deliveryId,
      code: claim.code,
      reason,
    }, logger);
    await completeAcademyDelivery(
      env,
      claim,
      accepted === "accepted" ? "manual_required" : "retry",
      now,
    );
    if (accepted !== "accepted") {
      throw loggedDeliveryError(
        logger,
        provider,
        deliveryId,
        accepted === "retry" ? "owner_alert_send_failed" : "owner_alert_unconfigured",
        true,
      );
    }
    logDeliveryIssue(logger, provider, deliveryId, reason);
    return "manual-required";
  }

  const email = env.ACADEMY_CODE_EMAIL;
  if (!email) {
    await completeAcademyDelivery(env, claim, "retry", now);
    throw loggedDeliveryError(logger, provider, deliveryId, "email_binding_unconfigured", true);
  }

  try {
    // Email acceptance and Academy completion are separate services. If this
    // send succeeds and completion fails, the lease eventually becomes
    // claimable again and may send a duplicate. Delivery is deliberately
    // at-least-once: a repeated single-use code is safer than silent loss.
    await email.send(buildCodeEmail(recipient, claim.code));
  } catch (error) {
    const reason = emailFailureCode(error);
    if (isRetryableEmailFailure(reason)) {
      await completeAcademyDelivery(env, claim, "retry", now);
      throw loggedDeliveryError(logger, provider, deliveryId, reason, true, error);
    }
    const ownerAccepted = await sendOwnerManualNotice(env, {
      provider,
      deliveryId,
      code: claim.code,
      reason,
    }, logger);
    await completeAcademyDelivery(
      env,
      claim,
      ownerAccepted === "accepted" ? "manual_required" : "retry",
      now,
    );
    if (ownerAccepted !== "accepted") {
      throw loggedDeliveryError(
        logger,
        provider,
        deliveryId,
        ownerAccepted === "retry" ? "owner_alert_send_failed" : "owner_alert_unconfigured",
        true,
      );
    }
    logDeliveryIssue(logger, provider, deliveryId, reason);
    return "manual-required";
  }

  await completeAcademyDelivery(env, claim, "email_accepted", now);
  return "email-accepted";
}

/**
 * Finds stale Academy-owned rows without reading payment identity. The oldest
 * actionable row is sent to the configured owner address for provider-channel
 * handoff, while the aggregate alert contains counts only.
 */
export async function reconcileAcademyCodeDeliveries(
  env: AcademyCodeDeliveryEnv,
  input: ReconcileAcademyCodeDeliveriesInput = {},
): Promise<AcademyCodeDeliveryReconciliation> {
  const now = readNow(input.now);
  const staleAfterMs = readDuration(
    input.staleAfterMs,
    DEFAULT_STALE_AFTER_MS,
    "Delivery stale interval",
  );
  const limit = readLimit(input.limit);
  const logger = input.logger ?? console;
  const staleBefore = now - staleAfterMs;
  const pending = await listPendingAcademyDeliveries(env, staleBefore, limit);
  const counts = countPending(pending.deliveries);

  if (pending.count === 0) {
    return {
      stale: 0,
      ...counts,
      ownerAlertAccepted: false,
      manualCodeAccepted: false,
    };
  }

  logReconciliationAlert(logger, pending.count, counts);
  const owner = normalizeRecipientEmail(env.ACADEMY_DELIVERY_ALERT_EMAIL);
  const email = env.ACADEMY_CODE_EMAIL;
  let manualCodeAccepted = false;

  if (owner && email) {
    const oldest = pending.deliveries.find(delivery => delivery.status !== "manual_required");
    if (oldest) {
      try {
        const claim = await claimAcademyDelivery(env, oldest.deliveryId, staleBefore);
        if (claim.status === "claimed") {
          const accepted = await sendOwnerManualNotice(env, {
            provider: oldest.provider,
            deliveryId: oldest.deliveryId,
            code: claim.code,
            reason: "stale_delivery",
          }, logger);
          await completeAcademyDelivery(
            env,
            claim,
            accepted === "accepted" ? "manual_required" : "retry",
            now,
          );
          manualCodeAccepted = accepted === "accepted";
          if (accepted !== "accepted") {
            logDeliveryIssue(
              logger,
              oldest.provider,
              oldest.deliveryId,
              accepted === "retry" ? "owner_alert_send_failed" : "owner_alert_unconfigured",
            );
          }
        }
      } catch (error) {
        if (error instanceof AcademyCodeDeliveryError) {
          logDeliveryIssue(logger, oldest.provider, oldest.deliveryId, error.reason);
        } else {
          logDeliveryIssue(logger, oldest.provider, oldest.deliveryId, "manual_dispatch_failed");
        }
      }
    }
  }

  const unresolvedActionable = counts.pending + counts.retry + counts.leased
    - (manualCodeAccepted ? 1 : 0);
  const ownerAlertAccepted = unresolvedActionable > 0
    ? await sendOwnerAggregateAlert(env, pending.count, counts, logger)
    : false;
  return {
    stale: pending.count,
    ...counts,
    ownerAlertAccepted,
    manualCodeAccepted,
  };
}

async function claimAcademyDelivery(
  env: AcademyCodeDeliveryEnv,
  deliveryId: string,
  staleBefore?: number,
): Promise<ClaimedDelivery | TerminalDelivery> {
  const response = await academyRequest(env, "/academy/internal/payment-delivery-claim", {
    deliveryId,
    ...(staleBefore === undefined ? {} : { staleBefore }),
  });
  const body = await responseJson(response);
  if (response.status === 200) {
    const terminal = readTerminalDelivery(body, deliveryId);
    if (terminal) return terminal;
    return readClaimedDelivery(body, deliveryId);
  }
  if (response.status === 202) {
    throw new AcademyCodeDeliveryError("delivery_not_claimable", true);
  }
  if (response.status === 404) {
    throw new AcademyCodeDeliveryError("delivery_not_found", false);
  }
  if (response.status === 409) {
    throw new AcademyCodeDeliveryError("delivery_unavailable", false);
  }
  throw new AcademyCodeDeliveryError(
    response.status >= 500 ? "academy_service_failed" : "academy_protocol_rejected",
    response.status >= 500 || response.status === 429,
  );
}

async function completeAcademyDelivery(
  env: AcademyCodeDeliveryEnv,
  claim: ClaimedDelivery,
  outcome: "email_accepted" | "manual_required" | "retry",
  now: number,
): Promise<void> {
  const response = await academyRequest(env, "/academy/internal/payment-delivery-complete", {
    deliveryId: claim.deliveryId,
    leaseToken: claim.leaseToken,
    outcome,
    ...(outcome === "retry" ? { retryAt: now + DEFAULT_RETRY_DELAY_MS } : {}),
  });
  const body = await responseJson(response);
  if (
    response.status === 200
    && isRecord(body)
    && body.deliveryId === claim.deliveryId
    && body.status === outcome
  ) return;
  throw new AcademyCodeDeliveryError(
    response.status >= 500 ? "academy_completion_failed" : "academy_completion_rejected",
    response.status >= 500 || response.status === 409 || response.status === 429,
  );
}

async function listPendingAcademyDeliveries(
  env: AcademyCodeDeliveryEnv,
  staleBefore: number,
  limit: number,
): Promise<PendingDeliveryResponse> {
  const response = await academyRequest(env, "/academy/internal/payment-delivery-pending", {
    staleBefore,
    limit,
  });
  const body = await responseJson(response);
  if (response.status !== 200 || !isRecord(body) || !Array.isArray(body.deliveries)) {
    throw new AcademyCodeDeliveryError(
      response.status >= 500 ? "academy_reconciliation_failed" : "academy_reconciliation_rejected",
      response.status >= 500 || response.status === 429,
    );
  }
  if (body.staleBefore !== staleBefore || body.count !== body.deliveries.length) {
    throw new AcademyCodeDeliveryError("academy_reconciliation_invalid", true);
  }
  const deliveries = body.deliveries.map(readPendingDelivery);
  return { staleBefore, count: deliveries.length, deliveries };
}

async function academyRequest(
  env: AcademyCodeDeliveryEnv,
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<Response> {
  const service = env.ACADEMY_PAYMENT_INGRESS;
  const token = env.PAYMENT_INGRESS_TOKEN?.trim();
  if (!service || !token) {
    throw new AcademyCodeDeliveryError("academy_service_unconfigured", true);
  }
  try {
    return await service.fetch(new Request(`${ACADEMY_INTERNAL_ORIGIN}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }));
  } catch (error) {
    throw new AcademyCodeDeliveryError("academy_service_failed", true, { cause: error });
  }
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function readClaimedDelivery(value: unknown, deliveryId: string): ClaimedDelivery {
  if (
    !isRecord(value)
    || value.status !== "claimed"
    || value.deliveryId !== deliveryId
    || typeof value.leaseToken !== "string"
    || !LEASE_TOKEN_PATTERN.test(value.leaseToken)
    || typeof value.code !== "string"
    || !INVITE_CODE_PATTERN.test(value.code)
  ) {
    throw new AcademyCodeDeliveryError("academy_claim_invalid", true);
  }
  return {
    status: "claimed",
    deliveryId,
    leaseToken: value.leaseToken,
    code: value.code,
  };
}

function readTerminalDelivery(value: unknown, deliveryId: string): TerminalDelivery | null {
  if (
    !isRecord(value)
    || value.deliveryId !== deliveryId
    || (value.status !== "email_accepted" && value.status !== "manual_required")
  ) return null;
  return { status: value.status, deliveryId };
}

function readPendingDelivery(value: unknown): PendingDelivery {
  if (
    !isRecord(value)
    || typeof value.deliveryId !== "string"
    || !DELIVERY_ID_PATTERN.test(value.deliveryId)
    || !isProvider(value.provider)
    || (
      value.status !== "pending"
      && value.status !== "retry"
      && value.status !== "manual_required"
      && value.status !== "leased"
    )
    || !isCount(value.attemptCount)
    || !isTimestamp(value.availableAt)
    || !isTimestamp(value.updatedAt)
  ) {
    throw new AcademyCodeDeliveryError("academy_reconciliation_invalid", true);
  }
  return {
    deliveryId: value.deliveryId,
    provider: value.provider,
    status: value.status,
    attemptCount: value.attemptCount,
    availableAt: value.availableAt,
    updatedAt: value.updatedAt,
  };
}

async function sendOwnerManualNotice(
  env: AcademyCodeDeliveryEnv,
  detail: {
    readonly provider: AcademyCodeProvider;
    readonly deliveryId: string;
    readonly code: string;
    readonly reason: string;
  },
  logger: AcademyCodeDeliveryLogger,
): Promise<"accepted" | "unavailable" | "retry"> {
  const owner = normalizeRecipientEmail(env.ACADEMY_DELIVERY_ALERT_EMAIL);
  const email = env.ACADEMY_CODE_EMAIL;
  if (!owner || !email) return "unavailable";
  try {
    await email.send(buildOwnerManualEmail(
      owner,
      detail.code,
      detail.provider,
      detail.deliveryId,
      detail.reason,
    ));
    return "accepted";
  } catch (error) {
    const reason = emailFailureCode(error);
    logDeliveryIssue(logger, detail.provider, detail.deliveryId, reason);
    return isRetryableEmailFailure(reason) ? "retry" : "unavailable";
  }
}

async function sendOwnerAggregateAlert(
  env: AcademyCodeDeliveryEnv,
  total: number,
  counts: Omit<AcademyCodeDeliveryReconciliation, "stale" | "ownerAlertAccepted" | "manualCodeAccepted">,
  logger: AcademyCodeDeliveryLogger,
): Promise<boolean> {
  const owner = normalizeRecipientEmail(env.ACADEMY_DELIVERY_ALERT_EMAIL);
  const email = env.ACADEMY_CODE_EMAIL;
  if (!owner || !email) return false;
  try {
    await email.send(buildOwnerAggregateEmail(owner, total, counts));
    return true;
  } catch (error) {
    logger.error(JSON.stringify({
      event: "yomu_support_academy_delivery_alert_failed",
      reason: emailFailureCode(error),
    }));
    return false;
  }
}

function buildCodeEmail(recipient: string, code: string): AcademyCodeEmailMessage {
  const escapedCode = escapeHtml(code);
  const escapedUrl = escapeHtml(ACADEMY_URL);
  return {
    to: recipient,
    from: CODE_SENDER,
    subject: "Your よむ Academy code / よむ Academy コード",
    text: [
      "Your payment is complete. Here is your よむ Academy code:",
      "",
      code,
      "",
      `Open ${ACADEMY_URL} and enter it within 30 days of payment.`,
      "The code can be used once with the Google account you choose.",
      "",
      "ご支援ありがとうございます。よむ Academy のコードです：",
      "",
      code,
      "",
      `${ACADEMY_URL} を開き、支払いから30日以内に入力してください。`,
      "コードは1回だけ使えます。使用するGoogleアカウントはご自身で選べます。",
    ].join("\n"),
    html: [
      "<p>Your payment is complete. Here is your よむ Academy code:</p>",
      `<p><strong><code>${escapedCode}</code></strong></p>`,
      `<p><a href="${escapedUrl}">Open よむ Academy</a> and enter it within 30 days of payment. `,
      "The code can be used once with the Google account you choose.</p>",
      "<hr>",
      "<p>ご支援ありがとうございます。よむ Academy のコードです：</p>",
      `<p><strong><code>${escapedCode}</code></strong></p>`,
      `<p><a href="${escapedUrl}">よむ Academy を開き</a>、支払いから30日以内に入力してください。`,
      "コードは1回だけ使えます。使用するGoogleアカウントはご自身で選べます。</p>",
    ].join(""),
  };
}

function buildOwnerManualEmail(
  owner: string,
  code: string,
  provider: AcademyCodeProvider,
  deliveryId: string,
  reason: string,
): AcademyCodeEmailMessage {
  const providerLabel = providerName(provider);
  const escapedCode = escapeHtml(code);
  const escapedProvider = escapeHtml(providerLabel);
  const escapedDeliveryId = escapeHtml(deliveryId);
  return {
    to: owner,
    from: CODE_SENDER,
    subject: "よむ Academy code needs manual delivery / コードの手動送信",
    text: [
      "An Academy payment needs manual code delivery.",
      `Provider: ${providerLabel}`,
      `Delivery ID: ${deliveryId}`,
      `Reason: ${reason}`,
      "",
      `Code: ${code}`,
      "",
      "Send the code through the payment platform's own message channel.",
      "The learner should redeem it within 30 days of payment.",
      "",
      "Academy のコードを手動で送信してください。",
      `決済サービス: ${providerLabel}`,
      `配信ID: ${deliveryId}`,
      "",
      `コード: ${code}`,
      "",
      "決済サービスのメッセージ機能でコードを送ってください。",
      "支払いから30日以内に入力してもらってください。",
    ].join("\n"),
    html: [
      "<p>An Academy payment needs manual code delivery.</p>",
      `<p>Provider: ${escapedProvider}<br>Delivery ID: <code>${escapedDeliveryId}</code></p>`,
      `<p><strong>Code: <code>${escapedCode}</code></strong></p>`,
      "<p>Send the code through the payment platform's own message channel. ",
      "The learner should redeem it within 30 days of payment.</p>",
      "<hr>",
      "<p>Academy のコードを手動で送信してください。</p>",
      `<p>決済サービス: ${escapedProvider}<br>配信ID: <code>${escapedDeliveryId}</code></p>`,
      `<p><strong>コード: <code>${escapedCode}</code></strong></p>`,
      "<p>決済サービスのメッセージ機能でコードを送ってください。支払いから30日以内に入力してもらってください。</p>",
    ].join(""),
  };
}

function buildOwnerAggregateEmail(
  owner: string,
  total: number,
  counts: Omit<AcademyCodeDeliveryReconciliation, "stale" | "ownerAlertAccepted" | "manualCodeAccepted">,
): AcademyCodeEmailMessage {
  const detail = `pending=${counts.pending}, retry=${counts.retry}, manual_required=${counts.manualRequired}, leased=${counts.leased}`;
  return {
    to: owner,
    from: CODE_SENDER,
    subject: "よむ Academy delivery alert / 配信アラート",
    text: [
      `${total} Academy code delivery record(s) need attention.`,
      detail,
      "",
      "The scheduled check processes the oldest actionable record on each run.",
      "",
      `${total}件の Academy コード配信を確認してください。`,
      detail,
      "",
      "定期確認は、対応できる最も古い記録を各実行で1件処理します。",
    ].join("\n"),
    html: [
      `<p>${total} Academy code delivery record(s) need attention.</p>`,
      `<p><code>${escapeHtml(detail)}</code></p>`,
      "<p>The scheduled check processes the oldest actionable record on each run.</p>",
      "<hr>",
      `<p>${total}件の Academy コード配信を確認してください。</p>`,
      `<p><code>${escapeHtml(detail)}</code></p>`,
      "<p>定期確認は、対応できる最も古い記録を各実行で1件処理します。</p>",
    ].join(""),
  };
}

function normalizeRecipientEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (email !== value || email.length < 3 || email.length > 254) return null;
  if (/[\u0000-\u0020\u007f-\u009f]/u.test(email)) return null;
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator !== email.indexOf("@")) return null;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1).toLowerCase();
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(local)) return null;
  if (domain.length > 253 || !domain.includes(".")) return null;
  const labels = domain.split(".");
  if (labels.some(label => (
    label.length < 1
    || label.length > 63
    || label.startsWith("-")
    || label.endsWith("-")
    || !/^[a-z0-9-]+$/u.test(label)
  ))) return null;
  if (labels.at(-1)!.length < 2) return null;
  return `${local}@${domain}`;
}

function emailFailureCode(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) return "email_send_failed";
  const code = String(error.code);
  return KNOWN_EMAIL_ERROR_CODES.has(code) ? code : "email_send_failed";
}

function isRetryableEmailFailure(reason: string): boolean {
  return RETRYABLE_EMAIL_ERROR_CODES.has(reason);
}

function countPending(deliveries: readonly PendingDelivery[]): {
  readonly pending: number;
  readonly retry: number;
  readonly manualRequired: number;
  readonly leased: number;
} {
  return {
    pending: deliveries.filter(delivery => delivery.status === "pending").length,
    retry: deliveries.filter(delivery => delivery.status === "retry").length,
    manualRequired: deliveries.filter(delivery => delivery.status === "manual_required").length,
    leased: deliveries.filter(delivery => delivery.status === "leased").length,
  };
}

function logReconciliationAlert(
  logger: AcademyCodeDeliveryLogger,
  total: number,
  counts: ReturnType<typeof countPending>,
): void {
  logger.error(JSON.stringify({
    event: "yomu_support_academy_delivery_attention",
    total,
    ...counts,
  }));
}

function loggedDeliveryError(
  logger: AcademyCodeDeliveryLogger,
  provider: AcademyCodeProvider,
  deliveryId: string,
  reason: string,
  retryable: boolean,
  cause?: unknown,
): AcademyCodeDeliveryError {
  logDeliveryIssue(logger, provider, deliveryId, reason);
  return new AcademyCodeDeliveryError(
    reason,
    retryable,
    cause === undefined ? undefined : { cause },
  );
}

function logDeliveryIssue(
  logger: AcademyCodeDeliveryLogger,
  provider: AcademyCodeProvider,
  deliveryId: string,
  reason: string,
): void {
  logger.error(JSON.stringify({
    event: "yomu_support_academy_code_delivery_attention",
    provider,
    deliveryId,
    reason,
  }));
}

function providerName(provider: AcademyCodeProvider): string {
  if (provider === "stripe") return "Stripe";
  if (provider === "kofi") return "Ko-fi";
  return "Patreon";
}

function readProvider(value: AcademyCodeProvider): AcademyCodeProvider {
  if (!isProvider(value)) throw new TypeError("Unsupported Academy code provider.");
  return value;
}

function isProvider(value: unknown): value is AcademyCodeProvider {
  return value === "stripe" || value === "kofi" || value === "patreon";
}

function readDeliveryId(value: string): string {
  if (!DELIVERY_ID_PATTERN.test(value)) throw new TypeError("Academy delivery id is malformed.");
  return value;
}

function readNow(value: number | undefined): number {
  const now = value ?? Date.now();
  if (!isTimestamp(now)) throw new TypeError("Delivery time must be an epoch-milliseconds timestamp.");
  return now;
}

function readDuration(value: number | undefined, fallback: number, label: string): number {
  const duration = value ?? fallback;
  if (!Number.isSafeInteger(duration) || duration < 60_000 || duration > 7 * 24 * 60 * 60_000) {
    throw new TypeError(`${label} is outside the allowed range.`);
  }
  return duration;
}

function readLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_RECONCILIATION_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RECONCILIATION_LIMIT) {
    throw new TypeError(`Reconciliation limit must be from 1 to ${MAX_RECONCILIATION_LIMIT}.`);
  }
  return limit;
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 1_500_000_000_000
    && (value as number) <= 4_102_444_800_000;
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
