export type HexColorNormalizer = (color: string) => string;

const FALLBACK_HEX_COLOR = '#000000';

function normalizeHexColor(color: string): string {
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : FALLBACK_HEX_COLOR;
}

export function sharedContrastRatio(a: string, b: string, normalizeColor: HexColorNormalizer = normalizeHexColor): number {
    const l1 = relativeLuminance(a, normalizeColor);
    const l2 = relativeLuminance(b, normalizeColor);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(color: string, normalizeColor: HexColorNormalizer = normalizeHexColor): number {
    const [red, green, blue] = sharedHexToRgb(color, normalizeColor).map(value => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function sharedMixHex(from: string, to: string, amount: number, normalizeColor: HexColorNormalizer = normalizeHexColor): string {
    const a = sharedHexToRgb(from, normalizeColor);
    const b = sharedHexToRgb(to, normalizeColor);
    return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

export function sharedHexToRgb(color: string, normalizeColor: HexColorNormalizer = normalizeHexColor): [number, number, number] {
    const safe = normalizeHexColor(normalizeColor(color));
    return [
        parseInt(safe.slice(1, 3), 16),
        parseInt(safe.slice(3, 5), 16),
        parseInt(safe.slice(5, 7), 16),
    ];
}

export function sharedHexToRgba(color: string, alpha: number, normalizeColor: HexColorNormalizer = normalizeHexColor): string {
    const [red, green, blue] = sharedHexToRgb(color, normalizeColor);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
}
