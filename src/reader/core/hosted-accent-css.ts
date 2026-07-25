import { sharedContrastRatio, sharedHexToRgba, sharedMixHex } from './color-math';

// Every hosted surface (docs, study/new tab, PDF reader, video player) paints
// the accent through these tokens, so the pre-paint bootstrap and the runtime
// re-sync derive identical values from one place instead of drifting apart.
export const HOSTED_ACCENT_TOKENS = {
    accent: '#5ea780',
    black: '#000000',
    white: '#ffffff',
    readableInk: '#11161d',
    pageBgDark: '#181b20',
    pageBgLight: '#ffffff',
} as const;

const TEXT_CONTRAST = 4.5;
const BRAND_CONTRAST = 4.5;
const BRAND_STATE_CONTRAST = 3.5;

export function sanitizeHostedAccentColor(value: unknown, fallback: string = HOSTED_ACCENT_TOKENS.accent): string {
    return hostedAccentColorFromValue(value) ?? fallback;
}

export function hostedAccentColorFromValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    return shortHex ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase() : undefined;
}

export function readableTextOnHostedAccent(background: string): string {
    const inkContrast = hostedContrastRatio(background, HOSTED_ACCENT_TOKENS.readableInk);
    const whiteContrast = hostedContrastRatio(background, HOSTED_ACCENT_TOKENS.white);
    const preferred = inkContrast >= whiteContrast ? HOSTED_ACCENT_TOKENS.readableInk : HOSTED_ACCENT_TOKENS.white;
    if (Math.max(inkContrast, whiteContrast) >= TEXT_CONTRAST) return preferred;

    const blackContrast = hostedContrastRatio(background, HOSTED_ACCENT_TOKENS.black);
    return blackContrast >= whiteContrast ? HOSTED_ACCENT_TOKENS.black : HOSTED_ACCENT_TOKENS.white;
}

// The full custom-property set a hosted surface needs for the chosen accent.
// Keyed by property name so callers can stamp it onto an element or serialise
// it into a stylesheet without knowing which tokens exist.
export function hostedAccentCssVariables(accentColor: unknown, dark: boolean): Record<string, string> {
    const accent = sanitizeHostedAccentColor(accentColor);
    const pageBackground = dark ? HOSTED_ACCENT_TOKENS.pageBgDark : HOSTED_ACCENT_TOKENS.pageBgLight;
    const brandReadable = readableHostedAccentOn(accent, pageBackground, BRAND_CONTRAST);
    const towardEdge = dark ? HOSTED_ACCENT_TOKENS.white : HOSTED_ACCENT_TOKENS.black;
    const brandHover = readableHostedAccentOn(hostedMixHex(accent, towardEdge, 0.18), pageBackground, BRAND_STATE_CONTRAST);
    const brandActive = readableHostedAccentOn(hostedMixHex(accent, HOSTED_ACCENT_TOKENS.black, 0.18), pageBackground, BRAND_STATE_CONTRAST);
    const brandSoft = sharedHexToRgba(accent, dark ? 0.22 : 0.16, sanitizeHostedAccentColor);
    const accentText = readableTextOnHostedAccent(accent);
    const brandText = readableTextOnHostedAccent(brandReadable);
    const brandHoverText = readableTextOnHostedAccent(brandHover);

    return {
        '--yomu-accent': accent,
        '--yomu-accent-readable': brandReadable,
        '--yomu-accent-ink': accentText,
        '--yomu-brand-ink': brandText,
        '--yomu-brand-hover-ink': brandHoverText,
        '--vp-c-brand-1': brandReadable,
        '--vp-c-brand-2': brandHover,
        '--vp-c-brand-3': accent,
        '--vp-c-brand-soft': brandSoft,
        '--vp-button-brand-border': brandReadable,
        '--vp-button-brand-bg': accent,
        '--vp-button-brand-text': accentText,
        '--vp-button-brand-hover-border': brandHover,
        '--vp-button-brand-hover-bg': brandHover,
        '--vp-button-brand-hover-text': accentText,
        '--vp-button-brand-active-border': brandActive,
        '--vp-button-brand-active-bg': brandActive,
        '--vp-button-brand-active-text': accentText,
        '--vp-home-hero-name-color': brandReadable,
        // Standalone surfaces (PDF reader, video player, study/new tab) paint
        // their own chrome from the short names.
        '--accent': accent,
        '--accent-ink': accentText,
        '--accent-soft': brandSoft,
        '--jpdb-reader-accent': accent,
        '--jpdb-reader-accent-readable': brandReadable,
        '--jpdb-reader-accent-text': accentText,
        '--jpdb-reader-accent-soft': brandSoft,
    };
}

function readableHostedAccentOn(color: string, background: string, targetContrast: number): string {
    const safe = sanitizeHostedAccentColor(color);
    if (hostedContrastRatio(safe, background) >= targetContrast) return safe;
    const toward = readableHostedMixTarget(background);
    for (let amount = 0.08; amount <= 1; amount += 0.08) {
        const mixed = hostedMixHex(safe, toward, amount);
        if (hostedContrastRatio(mixed, background) >= targetContrast) return mixed;
    }
    return toward;
}

function readableHostedMixTarget(background: string): string {
    return hostedContrastRatio(background, HOSTED_ACCENT_TOKENS.black) > hostedContrastRatio(background, HOSTED_ACCENT_TOKENS.white)
        ? HOSTED_ACCENT_TOKENS.black
        : HOSTED_ACCENT_TOKENS.white;
}

function hostedContrastRatio(a: string, b: string): number {
    return sharedContrastRatio(a, b, sanitizeHostedAccentColor);
}

function hostedMixHex(from: string, to: string, amount: number): string {
    return sharedMixHex(from, to, amount, sanitizeHostedAccentColor);
}
