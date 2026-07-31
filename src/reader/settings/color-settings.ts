import { sharedContrastRatio, sharedMixHex } from '../core/color-math';
import { BRAND_COLOR_TOKENS, OVERLAY_COLOR_TOKENS } from '../theme/color-tokens';

export const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
export const DEFAULT_OCR_BACKGROUND_OPACITY = 0.68;
export const DEFAULT_OCR_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
export const DEFAULT_OCR_OUTLINE_COLOR = OVERLAY_COLOR_TOKENS.outline;

const OCR_BACKGROUND_MIN_TEXT_CONTRAST = 4.5;
const OCR_BACKGROUND_MIN_RENDERED_OPACITY = 0.56;

export function sanitizeAccentColor(value: unknown, fallback: string = DEFAULT_ACCENT_COLOR): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (!shortHex) return fallback;
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
}

export function accentToRgba(color: string, alpha: number): string {
    const safe = sanitizeAccentColor(color);
    const red = parseInt(safe.slice(1, 3), 16);
    const green = parseInt(safe.slice(3, 5), 16);
    const blue = parseInt(safe.slice(5, 7), 16);
    return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
}

export function accessibleOcrBackgroundOpacity(opacity: unknown): number {
    const numericOpacity = Number(opacity);
    const clampedOpacity = Number.isFinite(numericOpacity)
        ? Math.max(0, Math.min(1, numericOpacity))
        : DEFAULT_OCR_BACKGROUND_OPACITY;
    return Math.max(OCR_BACKGROUND_MIN_RENDERED_OPACITY, clampedOpacity);
}

export function accessibleOcrBackgroundColor(accentColor: unknown, opacity: unknown = DEFAULT_OCR_BACKGROUND_OPACITY): string {
    const accent = sanitizeAccentColor(accentColor);
    const renderedOpacity = accessibleOcrBackgroundOpacity(opacity);
    if (ocrRenderedBackgroundContrast(accent, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
        return accent;
    }
    for (let amount = 0.08; amount <= 1; amount += 0.04) {
        const candidate = sharedMixHex(accent, '#000000', amount, sanitizeAccentColor);
        if (ocrRenderedBackgroundContrast(candidate, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
            return candidate;
        }
    }
    return '#000000';
}

function ocrRenderedBackgroundContrast(color: string, opacity: number): number {
    const renderedOnWhite = sharedMixHex('#ffffff', color, opacity, sanitizeAccentColor);
    return sharedContrastRatio(renderedOnWhite, DEFAULT_OCR_TEXT_COLOR, sanitizeAccentColor);
}

export const DEFAULT_OCR_BACKGROUND_COLOR = accessibleOcrBackgroundColor(
    DEFAULT_ACCENT_COLOR,
    DEFAULT_OCR_BACKGROUND_OPACITY,
);
