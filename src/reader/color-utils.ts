import { sanitizeAccentColor } from './settings';

export function readableOn(color: string, background: string, targetContrast: number): string {
    const safe = sanitizeAccentColor(color);
    if (contrastRatio(safe, background) >= targetContrast) return safe;
    const toward = contrastRatio(background, '#000000') > contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
    for (let amount = 0.08; amount <= 1; amount += 0.08) {
        const mixed = mixHex(safe, toward, amount);
        if (contrastRatio(mixed, background) >= targetContrast) return mixed;
    }
    return toward;
}

export function readableOnAll(color: string, backgrounds: string[], targetContrast: number): string {
    const safe = sanitizeAccentColor(color);
    if (backgrounds.every(background => contrastRatio(safe, background) >= targetContrast)) return safe;

    const candidates = ['#000000', '#ffffff']
        .map(toward => closestReadableMix(safe, toward, backgrounds, targetContrast))
        .filter((candidate): candidate is { color: string; amount: number; contrast: number } => Boolean(candidate))
        .sort((a, b) => a.amount - b.amount || b.contrast - a.contrast);
    if (candidates[0]) return candidates[0].color;

    return ['#000000', '#ffffff']
        .map(fallback => ({ color: fallback, contrast: minContrast(fallback, backgrounds) }))
        .sort((a, b) => b.contrast - a.contrast)[0]?.color ?? '#000000';
}

export function contrastRatio(a: string, b: string): number {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
}

export function mixHex(from: string, to: string, amount: number): string {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgba(color: string, alpha: number): string {
    const [red, green, blue] = hexToRgb(color);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
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

function relativeLuminance(color: string): number {
    const [red, green, blue] = hexToRgb(color).map(value => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hexToRgb(color: string): [number, number, number] {
    const safe = sanitizeAccentColor(color);
    return [
        parseInt(safe.slice(1, 3), 16),
        parseInt(safe.slice(3, 5), 16),
        parseInt(safe.slice(5, 7), 16),
    ];
}
