import { sanitizeAccentColor } from '../settings/index';
import { sharedHexToRgb } from '../core/color-math';

export interface RgbaColor {
    red: number;
    green: number;
    blue: number;
    alpha: number;
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

function expandHexColor(value: string): string {
    return value.length === 3
        ? `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
        : `#${value}`;
}

function hexToRgbaColor(color: string): RgbaColor {
    const [red, green, blue] = sharedHexToRgb(color, sanitizeAccentColor);
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
