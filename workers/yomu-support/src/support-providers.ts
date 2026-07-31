export const SUPPORT_PROVIDERS = [
  {
    id: "stripe",
    label: "Card (Stripe)",
    kind: "checkout",
    urlEnv: null,
    allowedHosts: [],
  },
  {
    id: "kofi",
    label: "Ko-fi",
    kind: "link",
    urlEnv: "SUPPORT_PROVIDER_KOFI_URL",
    allowedHosts: ["ko-fi.com"],
    requiredEnv: ["KOFI_WEBHOOK_SECRET"],
  },
  {
    id: "bmac",
    label: "Buy Me a Coffee",
    kind: "link",
    urlEnv: "SUPPORT_PROVIDER_BMAC_URL",
    allowedHosts: ["buymeacoffee.com"],
    requiredEnv: ["BMAC_WEBHOOK_SECRET"],
  },
  {
    id: "paypal",
    label: "PayPal",
    kind: "link",
    urlEnv: "SUPPORT_PROVIDER_PAYPAL_URL",
    allowedHosts: ["paypal.me", "paypal.com"],
    requiredEnv: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"],
  },
  {
    id: "patreon",
    label: "Patreon",
    kind: "link",
    urlEnv: "SUPPORT_PROVIDER_PATREON_URL",
    allowedHosts: ["patreon.com"],
    requiredEnv: ["PATREON_WEBHOOK_SECRET"],
  },
] as const;

export type SupportProviderId = (typeof SUPPORT_PROVIDERS)[number]["id"];
export type ExternalSupportProviderId = Exclude<SupportProviderId, "stripe">;
export type SupportProviderConfig = (typeof SUPPORT_PROVIDERS)[number];

export const EXTERNAL_SUPPORT_PROVIDER_IDS = SUPPORT_PROVIDERS
  .filter((provider): provider is Exclude<SupportProviderConfig, { id: "stripe" }> => provider.id !== "stripe")
  .map(provider => provider.id);

export function configuredSupportProviderUrl(
  provider: Exclude<SupportProviderConfig, { id: "stripe" }>,
  env: object,
): string | null {
  const value = (env as Record<string, unknown>)[provider.urlEnv];
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !provider.allowedHosts.some(host => providerHostMatches(url, host))) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function supportProviderReady(
  provider: Exclude<SupportProviderConfig, { id: "stripe" }>,
  env: object,
): boolean {
  const values = env as Record<string, unknown>;
  return Boolean(values.SUPPORT_DB)
    && provider.requiredEnv.every(name => typeof values[name] === "string" && Boolean(values[name].trim()));
}

function providerHostMatches(url: URL, host: string): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === host || hostname === `www.${host}`;
}
