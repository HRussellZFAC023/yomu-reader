import {
  isNumericProviderReferenceFormat,
  isThreeLetterCurrencyCode,
} from "./external-donation-webhooks";

const PATREON_ACCOUNTING_EVENT_TYPES = new Set(["members:create", "members:update"]);

export interface PatreonIncomeEnv {
  PATREON_CAMPAIGN_ID?: string;
  PATREON_CAMPAIGN_CURRENCY?: string;
}

export interface PatreonIncomeDatabase {
  prepare(query: string): PatreonIncomeStatement;
}

interface PatreonIncomeStatement {
  bind(...values: unknown[]): PatreonIncomeStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface PatreonCampaignConfig {
  campaignId: string;
  currency: string;
}

interface PatreonAccountingSnapshot {
  campaignId: string;
  memberId: string;
  currency: string;
  lifetimeSupportMinor: number;
  lastChargeAt: number;
}

export function patreonCampaignConfigured(env: PatreonIncomeEnv): boolean {
  return patreonCampaignConfig(env) !== null;
}

export function isPatreonAccountingTrigger(trigger: string): boolean {
  return PATREON_ACCOUNTING_EVENT_TYPES.has(trigger.trim().toLowerCase());
}

/** Only paid Member updates can advance the cumulative income high-water. */
export function isPatreonIncomeTrigger(trigger: string): boolean {
  return trigger.trim().toLowerCase() === "members:update";
}

/**
 * Atomically advances one member's cumulative paid-income high-water.
 *
 * Migration 0007 owns the delta insert trigger, so concurrent deliveries and
 * retries cannot split the read/modify/write boundary in Worker code.
 */
export async function recordPatreonAccountingSnapshot(
  env: PatreonIncomeEnv,
  db: PatreonIncomeDatabase,
  trigger: string,
  payload: unknown,
): Promise<boolean> {
  const snapshot = patreonAccountingSnapshot(env, trigger, payload);
  if (!snapshot) return false;
  const eventId = `patreon_${await sha256Hex([
    "patreon-paid-lifetime-v1",
    snapshot.campaignId,
    snapshot.memberId,
    String(snapshot.lastChargeAt),
    String(snapshot.lifetimeSupportMinor),
  ].join("\n"))}`;
  const values = [
    snapshot.campaignId,
    snapshot.memberId,
    snapshot.currency,
    snapshot.lifetimeSupportMinor,
    snapshot.lastChargeAt,
    eventId,
    new Date().toISOString(),
  ] as const;
  if (!isPatreonIncomeTrigger(trigger)) {
    await db.prepare(`
      INSERT OR IGNORE INTO patreon_member_accounting (
        campaign_id,
        member_id,
        currency,
        lifetime_support_minor,
        last_charge_at,
        event_id,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(...values).run();
    return false;
  }
  await db.prepare(`
    INSERT INTO patreon_member_accounting (
      campaign_id,
      member_id,
      currency,
      lifetime_support_minor,
      last_charge_at,
      event_id,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(campaign_id, member_id, currency) DO UPDATE SET
      lifetime_support_minor = excluded.lifetime_support_minor,
      last_charge_at = excluded.last_charge_at,
      event_id = excluded.event_id,
      updated_at = excluded.updated_at
    WHERE excluded.lifetime_support_minor > patreon_member_accounting.lifetime_support_minor
      AND excluded.last_charge_at >= patreon_member_accounting.last_charge_at
  `).bind(...values).run();
  const recorded = await db.prepare(`
    SELECT event_id
    FROM provider_donation_events
    WHERE provider = 'patreon' AND event_id = ?
  `).bind(eventId).first<{ event_id?: string }>();
  return recorded?.event_id === eventId;
}

function patreonCampaignConfig(env: PatreonIncomeEnv): PatreonCampaignConfig | null {
  const campaignId = env.PATREON_CAMPAIGN_ID?.trim();
  const campaignCurrency = env.PATREON_CAMPAIGN_CURRENCY;
  if (
    !isNumericProviderReferenceFormat(campaignId)
    || !isThreeLetterCurrencyCode(campaignCurrency)
  ) return null;
  return {
    campaignId,
    currency: campaignCurrency.trim().toLowerCase(),
  };
}

function patreonAccountingSnapshot(
  env: PatreonIncomeEnv,
  trigger: string,
  payload: unknown,
): PatreonAccountingSnapshot | null {
  const record = objectRecord(payload);
  const data = objectRecord(record?.data);
  const attributes = objectRecord(data?.attributes);
  const relationships = objectRecord(data?.relationships);
  const campaign = objectRecord(objectRecord(relationships?.campaign)?.data);
  const configuredCampaign = patreonCampaignConfig(env);
  const memberId = providerReference(data?.id);
  const campaignId = providerReference(campaign?.id);
  const lifetimeSupportMinor = patreonLifetimeSupportMinor(attributes);
  if (
    !data
    || data.type !== "member"
    || !attributes
    || !campaign
    || campaign.type !== "campaign"
    || !configuredCampaign
    || campaignId !== configuredCampaign.campaignId
    || !memberId
    || lifetimeSupportMinor === null
  ) return null;

  if (!isPatreonIncomeTrigger(trigger)) {
    return {
      campaignId,
      memberId,
      currency: configuredCampaign.currency,
      lifetimeSupportMinor,
      lastChargeAt: providerTimestamp(attributes.last_charge_date) ?? 0,
    };
  }
  const lastChargeAt = providerTimestamp(attributes.last_charge_date);
  if (
    lowerCaseStringField(attributes, "last_charge_status") !== "paid"
    || lowerCaseStringField(attributes, "patron_status") !== "active_patron"
    || attributes.is_free_trial === true
    || attributes.is_gifted === true
    || lastChargeAt === null
  ) return null;
  return {
    campaignId,
    memberId,
    currency: configuredCampaign.currency,
    lifetimeSupportMinor,
    lastChargeAt,
  };
}

function patreonLifetimeSupportMinor(attributes: Record<string, unknown> | null): number | null {
  const preferred = numberField(attributes, "campaign_lifetime_support_cents");
  const legacy = numberField(attributes, "lifetime_support_cents");
  if (preferred !== null && legacy !== null && preferred !== legacy) return null;
  const value = preferred ?? legacy;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
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

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function lowerCaseStringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value.toLowerCase() : "";
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, "0"),
  ).join("");
}
