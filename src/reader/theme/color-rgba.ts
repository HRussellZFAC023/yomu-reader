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
    if (color.startsWith('oklab(')) return parseOklabFunction(color);
    if (color.startsWith('oklch(')) return parseOklchFunction(color);
    return probeCssColor(color);
}

// Enumerating color spaces above will always lag the platform (Discord dark
// themes have already shipped oklab, then other spaces). The canvas fillStyle
// setter understands every color the browser can compute and serialises it
// back to hex/rgba/color(srgb), which the analytic parsers handle — so any
// format we don't model analytically is normalised by the engine itself.
const probedColors = new Map<string, RgbaColor | null>();
let probeContext: CanvasRenderingContext2D | null | undefined;

// jsdom has no 2d canvas, so the probe caches a null context on first use;
// tests that install a canvas mock need to clear that negative cache.
export function resetCssColorProbeForTests(): void {
    probedColors.clear();
    probeContext = undefined;
}

function probeCssColor(color: string): RgbaColor | null {
    const cached = probedColors.get(color);
    if (cached !== undefined) return cached;
    if (probeContext === undefined) {
        try {
            probeContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
        } catch {
            probeContext = null;
        }
    }
    let parsed: RgbaColor | null = null;
    if (probeContext) {
        try {
            // Sentinel first: an invalid color assignment leaves fillStyle
            // untouched, so "still the sentinel" means unparseable — without
            // this, genuine near-black colors would be indistinguishable.
            probeContext.fillStyle = '#010203';
            probeContext.fillStyle = color;
            const serialized = String(probeContext.fillStyle).toLowerCase();
            // Literal hex was parsed analytically before the probe, so the
            // sentinel can never collide with a genuine #010203 input here.
            if (serialized !== '#010203') {
                if (serialized.startsWith('#')) {
                    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(serialized);
                    parsed = hex ? hexToRgbaColor(expandHexColor(hex[1])) : null;
                } else if (serialized.startsWith('rgb')) {
                    parsed = parseRgbFunction(serialized);
                } else if (serialized.startsWith('color(srgb ')) {
                    parsed = parseSrgbFunction(serialized);
                }
                // Some engines serialise wide-gamut colors in their authored
                // space (lab(), color(display-p3 …)). Painting one pixel and
                // reading it back converts through the canvas's sRGB space,
                // which is exactly the approximation the contrast math needs.
                if (!parsed) parsed = probePixelColor(probeContext, color);
            }
        } catch {
            parsed = null;
        }
    }
    if (probedColors.size > 512) probedColors.clear();
    probedColors.set(color, parsed);
    return parsed;
}

function probePixelColor(context: CanvasRenderingContext2D, color: string): RgbaColor | null {
    try {
        context.canvas.width = 1;
        context.canvas.height = 1;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue, alphaByte] = context.getImageData(0, 0, 1, 1).data;
        return { red, green, blue, alpha: alphaByte / 255 };
    } catch {
        return null;
    }
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

function parseOklabFunction(value: string): RgbaColor | null {
    const parts = colorFunctionNumbers(value);
    if (parts.length < 3) return null;
    return oklabToRgba({
        lightness: parseOklabLightness(parts[0]),
        a: parseOklabAxis(parts[1]),
        b: parseOklabAxis(parts[2]),
        alpha: parts[3] ? parseAlpha(parts[3]) : 1,
    });
}

function parseOklchFunction(value: string): RgbaColor | null {
    const parts = colorFunctionNumbers(value);
    if (parts.length < 3) return null;
    const chroma = parseOklabAxis(parts[1]);
    const hue = Number.parseFloat(parts[2]) * Math.PI / 180;
    return oklabToRgba({
        lightness: parseOklabLightness(parts[0]),
        a: chroma * Math.cos(hue),
        b: chroma * Math.sin(hue),
        alpha: parts[3] ? parseAlpha(parts[3]) : 1,
    });
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

function parseOklabLightness(value: string): number {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return 0;
    return value.endsWith('%') ? parsed / 100 : parsed;
}

function parseOklabAxis(value: string): number {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return 0;
    return value.endsWith('%') ? parsed / 100 : parsed;
}

function oklabToRgba(color: { lightness: number; a: number; b: number; alpha: number }): RgbaColor {
    const l = color.lightness + 0.3963377774 * color.a + 0.2158037573 * color.b;
    const m = color.lightness - 0.1055613458 * color.a - 0.0638541728 * color.b;
    const s = color.lightness - 0.0894841775 * color.a - 1.2914855480 * color.b;
    const long = l ** 3;
    const medium = m ** 3;
    const short = s ** 3;
    return {
        red: linearSrgbToChannel(+4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
        green: linearSrgbToChannel(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
        blue: linearSrgbToChannel(-0.0041960863 * long - 0.7034186147 * medium + 1.7076147010 * short),
        alpha: color.alpha,
    };
}

function linearSrgbToChannel(value: number): number {
    const channel = value <= 0.0031308
        ? 12.92 * value
        : 1.055 * (value ** (1 / 2.4)) - 0.055;
    return clampChannel(channel * 255);
}

function parseAlpha(value: string): number {
    const alpha = value.endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseFloat(value);
    return Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
}

function clampChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}
