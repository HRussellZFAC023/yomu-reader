export const DONATION_CURRENCIES = Object.freeze({
  gbp: Object.freeze({ label: "GBP — British pound", minorDigits: 2, minMinor: 500, maxMinor: 50_000 }),
  usd: Object.freeze({ label: "USD — US dollar", minorDigits: 2, minMinor: 700, maxMinor: 70_000 }),
  eur: Object.freeze({ label: "EUR — Euro", minorDigits: 2, minMinor: 600, maxMinor: 60_000 }),
  cad: Object.freeze({ label: "CAD — Canadian dollar", minorDigits: 2, minMinor: 1_000, maxMinor: 100_000 }),
  aud: Object.freeze({ label: "AUD — Australian dollar", minorDigits: 2, minMinor: 1_100, maxMinor: 110_000 }),
  jpy: Object.freeze({ label: "JPY — Japanese yen", minorDigits: 0, minMinor: 1_000, maxMinor: 100_000 }),
} as const);

export type DonationCurrency = keyof typeof DONATION_CURRENCIES;

export const DONATION_CURRENCY_CODES = Object.freeze(
  Object.keys(DONATION_CURRENCIES) as DonationCurrency[],
);

export function isDonationCurrency(value: unknown): value is DonationCurrency {
  return typeof value === "string" && Object.hasOwn(DONATION_CURRENCIES, value);
}

export function validDonationMinor(amountMinor: number, currency: DonationCurrency): boolean {
  const config = DONATION_CURRENCIES[currency];
  return Number.isSafeInteger(amountMinor)
    && amountMinor >= config.minMinor
    && amountMinor <= config.maxMinor;
}
