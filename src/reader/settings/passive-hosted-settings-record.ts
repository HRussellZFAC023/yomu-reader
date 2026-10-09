import { HOSTED_DEMO_READER_SETTINGS } from '../app/hosted-demo-settings';

// The only records v1.9.3's hosted pages wrote on their own on yomureader.com:
// the homepage demo policy, the Academy seed and the theme, language or accent
// toggles, each with the `learningTargetChosen: false` those writers added.
// None of them holds learner data (ADR-0012).
const ACADEMY_READER_DEFAULTS = {
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
} as const;

const HOSTED_APPEARANCE_CHOICES: Readonly<Record<string, ReadonlySet<unknown>>> = {
    interfaceLanguage: new Set(['auto', 'en', 'ja']),
    theme: new Set(['auto', 'dark', 'light']),
};
const HOSTED_ACCENT_COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu;

function isPassiveHostedSettingsRecord(record: Record<string, unknown>): boolean {
    const entries = Object.entries(record)
        .filter(([key, value]) => key !== 'learningTargetChosen' || value !== false);
    return entries.every(isHostedAppearanceEntry)
        || extendsHostedPolicy(record, entries, ACADEMY_READER_DEFAULTS)
        || extendsHostedPolicy(record, entries, HOSTED_DEMO_READER_SETTINGS);
}

/** The same test over the page-local bytes app/storage reads. */
export function isPassiveHostedSettingsJson(serialized: string): boolean {
    let record: unknown;
    try {
        record = JSON.parse(serialized);
    } catch {
        return false;
    }
    return typeof record === 'object' && record !== null && !Array.isArray(record)
        && isPassiveHostedSettingsRecord(record as Record<string, unknown>);
}

function extendsHostedPolicy(
    record: Record<string, unknown>,
    entries: ReadonlyArray<[string, unknown]>,
    policy: Record<string, unknown>,
): boolean {
    return Object.entries(policy).every(([key, value]) => record[key] === value)
        && entries.every(entry => Object.hasOwn(policy, entry[0]) || isHostedAppearanceEntry(entry));
}

function isHostedAppearanceEntry([key, value]: [string, unknown]): boolean {
    if (key === 'accentColor') return typeof value === 'string' && HOSTED_ACCENT_COLOR_RE.test(value);
    return Object.hasOwn(HOSTED_APPEARANCE_CHOICES, key) && HOSTED_APPEARANCE_CHOICES[key].has(value);
}
