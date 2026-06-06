import { CORE_COLOR_TOKENS } from './color-tokens';
import { sanitizeAccentColor } from './settings';
import {
    sharedContrastRatio,
    sharedHexToRgba,
    sharedMixHex,
} from './core/color-math';

export { blendRgba, cssColorToHex, cssColorToRgba, rgbaToHex, type RgbaColor } from './color-rgba';

export function readableOn(color: string, background: string, targetContrast: number): string {
    const safe = sanitizeAccentColor(color);
    if (contrastRatio(safe, background) >= targetContrast) return safe;
    const toward = contrastRatio(background, CORE_COLOR_TOKENS.black) > contrastRatio(background, CORE_COLOR_TOKENS.white)
        ? CORE_COLOR_TOKENS.black
        : CORE_COLOR_TOKENS.white;
    for (let amount = 0.08; amount <= 1; amount += 0.08) {
        const mixed = mixHex(safe, toward, amount);
        if (contrastRatio(mixed, background) >= targetContrast) return mixed;
    }
    return toward;
}

export function readableOnAll(color: string, backgrounds: string[], targetContrast: number): string {
    const safe = sanitizeAccentColor(color);
    if (backgrounds.every(background => contrastRatio(safe, background) >= targetContrast)) return safe;

    const candidates = [CORE_COLOR_TOKENS.black, CORE_COLOR_TOKENS.white]
        .map(toward => closestReadableMix(safe, toward, backgrounds, targetContrast))
        .filter((candidate): candidate is { color: string; amount: number; contrast: number } => Boolean(candidate))
        .sort((a, b) => a.amount - b.amount || b.contrast - a.contrast);
    if (candidates[0]) return candidates[0].color;

    return [CORE_COLOR_TOKENS.black, CORE_COLOR_TOKENS.white]
        .map(fallback => ({ color: fallback, contrast: minContrast(fallback, backgrounds) }))
        .sort((a, b) => b.contrast - a.contrast)[0]?.color ?? CORE_COLOR_TOKENS.black;
}

export function contrastRatio(a: string, b: string): number {
    return sharedContrastRatio(a, b, sanitizeAccentColor);
}

export function mixHex(from: string, to: string, amount: number): string {
    return sharedMixHex(from, to, amount, sanitizeAccentColor);
}

export function hexToRgba(color: string, alpha: number): string {
    return sharedHexToRgba(color, alpha, sanitizeAccentColor);
}

export function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value);
}

function closestReadableMix(color: string, toward: string, backgrounds: string[], targetContrast: number): { color: string; amount: number; contrast: number } | null {
    for (let amount = 0.04; amount <= 1; amount += 0.04) {
        const mixed = mixHex(color, toward, amount);
        const contrast = minContrast(mixed, backgrounds);
        if (contrast >= targetContrast) return { color: mixed, amount, contrast };
    }
    return null;
}

function minContrast(color: string, backgrounds: string[]): number {
    return Math.min(...backgrounds.map(background => contrastRatio(color, background)));
}
