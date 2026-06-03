import { CORE_COLOR_TOKENS } from './color-tokens';
import { sanitizeAccentColor } from './settings';

export interface RgbaColor {
    red: number;
    green: number;
    blue: number;
    alpha: number;
}

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

export function cssColorToHex(value: string, backdrop?: RgbaColor): string | null {
    const color = cssColorToRgba(value);
    if (!color) return null;
    if (color.alpha >= 1) return rgbaToHex(color);
    return backdrop ? rgbaToHex(blendRgba(color, backdrop)) : null;
}

export function cssColorToRgba(value: string): RgbaColor | null {
    const color = value.trim().toLowerCase();
    if (!color || color === 'transparent') return { red: 0, green: 0, blue: 0, alpha: 0 };
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
    if (hex) return hexToRgbaColor(expandHexColor(hex[1]));
    if (color.startsWith('rgb(') || color.startsWith('rgba(')) return parseRgbFunction(color);
    if (color.startsWith('color(srgb ')) return parseSrgbFunction(color);
    return null;
}

export function blendRgba(foreground: RgbaColor, background: RgbaColor): RgbaColor {
    const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
    if (alpha <= 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
    const channel = (front: number, back: number) => Math.round((front * foreground.alpha + back * background.alpha * (1 - foreground.alpha)) / alpha);
    return {
        red: channel(foreground.red, background.red),
        green: channel(foreground.green, background.green),
        blue: channel(foreground.blue, background.blue),
        alpha,
    };
}

export function rgbaToHex(color: RgbaColor): string {
    return `#${[color.red, color.green, color.blue].map(value => clampChannel(value).toString(16).padStart(2, '0')).join('')}`;
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

function expandHexColor(value: string): string {
    return value.length === 3
        ? `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
        : `#${value}`;
}

function hexToRgbaColor(color: string): RgbaColor {
    const [red, green, blue] = hexToRgb(color);
    return { red, green, blue, alpha: 1 };
}

function parseRgbFunction(value: string): RgbaColor | null {
    const parts = colorFunctionNumbers(value);
    if (parts.length < 3) return null;
    return {
        red: parseRgbChannel(parts[0]),
        green: parseRgbChannel(parts[1]),
        blue: parseRgbChannel(parts[2]),
        alpha: parts[3] ? parseAlpha(parts[3]) : 1,
    };
}

function parseSrgbFunction(value: string): RgbaColor | null {
    const parts = colorFunctionNumbers(value);
    if (parts.length < 3) return null;
    return {
        red: parseSrgbChannel(parts[0]),
        green: parseSrgbChannel(parts[1]),
        blue: parseSrgbChannel(parts[2]),
        alpha: parts[3] ? parseAlpha(parts[3]) : 1,
    };
}

function colorFunctionNumbers(value: string): string[] {
    return value.match(/-?\d*\.?\d+%?/g) ?? [];
}

function parseRgbChannel(value: string): number {
    return clampChannel(value.endsWith('%') ? Number.parseFloat(value) * 2.55 : Number.parseFloat(value));
}

function parseSrgbChannel(value: string): number {
    return clampChannel(value.endsWith('%') ? Number.parseFloat(value) * 2.55 : Number.parseFloat(value) * 255);
}

function parseAlpha(value: string): number {
    const alpha = value.endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseFloat(value);
    return Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
}

function clampChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}
