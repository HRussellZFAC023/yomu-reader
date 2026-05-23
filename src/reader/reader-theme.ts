import {
    accentToRgba,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveReaderTextColorSource,
    effectiveSubtitleColorSource,
    effectiveSubtitleTextColorSource,
    sanitizeAccentColor,
} from './settings';
import type { ReaderColorSource, ReaderSettings } from './types';

const COLOR_SOURCE_CLASSES: Exclude<ReaderColorSource, 'auto' | 'off'>[] = ['status', 'jpdb', 'anki', 'pitch'];
const COLOR_CHANNELS = ['highlight', 'underline', 'text'] as const;
type ColorChannel = typeof COLOR_CHANNELS[number];
type AppliedColorSource = Exclude<ReaderColorSource, 'auto'>;
type ColorSourceMap = Record<ColorChannel, AppliedColorSource>;

export interface AppliedReaderTheme {
    furiganaMode: ReturnType<typeof effectiveFuriganaMode>;
    wordColorSources: ColorSourceMap;
    subtitleColorSources: ColorSourceMap;
}

export function applyReaderTheme(settings: ReaderSettings, root = document.documentElement): AppliedReaderTheme {
    const theme = appliedReaderTheme(settings);
    root.classList.toggle('jpdb-reader-theme-dark', settings.theme === 'dark');
    root.classList.toggle('jpdb-reader-theme-light', settings.theme === 'light');
    applyReaderAccentColor(settings.accentColor, root);
    applyReaderWordColors(settings, root);
    root.classList.toggle('jpdb-reader-hide-known', theme.furiganaMode === 'known-status');
    root.classList.remove('jpdb-reader-highlight-status', 'jpdb-reader-highlight-pitch', 'jpdb-reader-highlight-off');
    applyReaderColorSourceClasses(root, 'word', theme.wordColorSources);
    applyReaderColorSourceClasses(root, 'subtitle', theme.subtitleColorSources);
    return theme;
}

export function applyReaderAccentColor(color: string, root = document.documentElement): void {
    const accentColor = sanitizeAccentColor(color);
    root.style.setProperty('--jpdb-reader-accent', accentColor);
    root.style.setProperty('--jpdb-reader-accent-soft', accentToRgba(accentColor, 0.18));
    root.style.setProperty('--jpdb-reader-accent-readable', readableAccentOnSurface(accentColor, root));
    root.style.setProperty('--jpdb-reader-accent-text', readableTextOnAccent(accentColor));
}

export function applyReaderWordColors(settings: ReaderSettings, root = document.documentElement): void {
    Object.entries(readerStateColors(settings)).forEach(([state, color]) => {
        root.style.setProperty(`--jpdb-reader-state-${state}`, color);
        root.style.setProperty(`--jpdb-reader-state-${state}-soft`, accentToRgba(color, 0.16));
        root.style.setProperty(`--jpdb-reader-state-${state}-strong`, accentToRgba(color, 0.28));
    });
    Object.entries(readerPitchColors(settings)).forEach(([pattern, { color, alpha }]) => {
        root.style.setProperty(`--jpdb-reader-pitch-${pattern}`, color);
        root.style.setProperty(`--jpdb-reader-pitch-${pattern}-soft`, alpha > 0 ? accentToRgba(color, alpha) : 'transparent');
    });
}

function appliedReaderTheme(settings: ReaderSettings): AppliedReaderTheme {
    return {
        furiganaMode: effectiveFuriganaMode(settings),
        wordColorSources: {
            highlight: effectiveReaderColorSource(settings, settings.wordHighlightColorSource, 'jpdb'),
            underline: effectiveReaderColorSource(settings, settings.wordUnderlineColorSource, 'pitch'),
            text: effectiveReaderTextColorSource(settings, settings.wordTextColorSource, 'off'),
        },
        subtitleColorSources: {
            highlight: effectiveSubtitleColorSource(settings, settings.subtitleHighlightColorSource, 'jpdb'),
            underline: effectiveSubtitleColorSource(settings, settings.subtitleUnderlineColorSource, 'pitch'),
            text: effectiveSubtitleTextColorSource(settings, settings.subtitleTextColorSource, 'jpdb'),
        },
    };
}

function readerStateColors(settings: ReaderSettings): Record<string, string> {
    return {
        new: sanitizeAccentColor(settings.wordColorNew),
        learning: sanitizeAccentColor(settings.wordColorLearning),
        known: sanitizeAccentColor(settings.wordColorKnown),
        due: sanitizeAccentColor(settings.wordColorDue),
        failed: sanitizeAccentColor(settings.wordColorFailed),
        ignored: sanitizeAccentColor(settings.wordColorIgnored),
    };
}

function readerPitchColors(settings: ReaderSettings): Record<string, { color: string; alpha: number }> {
    return {
        heiban: { color: sanitizeAccentColor(settings.pitchColorHeiban), alpha: 0.14 },
        atamadaka: { color: sanitizeAccentColor(settings.pitchColorAtamadaka), alpha: 0.14 },
        nakadaka: { color: sanitizeAccentColor(settings.pitchColorNakadaka), alpha: 0.16 },
        odaka: { color: sanitizeAccentColor(settings.pitchColorOdaka), alpha: 0.14 },
        kifuku: { color: sanitizeAccentColor(settings.pitchColorKifuku), alpha: 0.14 },
        unknown: { color: sanitizeAccentColor(settings.pitchColorUnknown), alpha: 0 },
    };
}

function applyReaderColorSourceClasses(root: HTMLElement, scope: 'word' | 'subtitle', sources: ColorSourceMap): void {
    COLOR_CHANNELS.forEach(channel => {
        COLOR_SOURCE_CLASSES.forEach(source => {
            root.classList.toggle(`jpdb-reader-${scope}-${channel}-${source}`, sources[channel] === source);
        });
    });
}

function readableAccentOnSurface(accentColor: string, root: HTMLElement): string {
    const surface = readerSurfaceColor(root);
    const safeAccent = sanitizeAccentColor(accentColor);
    return readableOnAll(safeAccent, [
        surface,
        mixHex(surface, safeAccent, 0.18),
        mixHex(surface, safeAccent, 0.26),
    ], 4.5);
}

function readableTextOnAccent(accentColor: string): string {
    const darkText = '#11161d';
    const lightText = '#ffffff';
    return contrastRatio(accentColor, darkText) >= contrastRatio(accentColor, lightText) ? darkText : lightText;
}

function readerSurfaceColor(root: HTMLElement): string {
    const computed = typeof getComputedStyle === 'function'
        ? getComputedStyle(root).getPropertyValue('--jpdb-reader-surface').trim()
        : '';
    if (isHexColor(computed)) return sanitizeAccentColor(computed);
    if (root.classList.contains('jpdb-reader-theme-light')) return '#f7f8fa';
    return prefersLightMode() ? '#f7f8fa' : '#20242b';
}

function prefersLightMode(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
}

function readableOn(color: string, background: string, targetContrast: number): string {
    const safe = sanitizeAccentColor(color);
    if (contrastRatio(safe, background) >= targetContrast) return safe;
    const toward = contrastRatio(background, '#000000') > contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
    for (let amount = 0.08; amount <= 1; amount += 0.08) {
        const mixed = mixHex(safe, toward, amount);
        if (contrastRatio(mixed, background) >= targetContrast) return mixed;
    }
    return toward;
}

function readableOnAll(color: string, backgrounds: string[], targetContrast: number): string {
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

function contrastRatio(a: string, b: string): number {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(color: string): number {
    const [red, green, blue] = hexToRgb(color).map(value => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function mixHex(from: string, to: string, amount: number): string {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(color: string): [number, number, number] {
    const safe = sanitizeAccentColor(color);
    return [
        parseInt(safe.slice(1, 3), 16),
        parseInt(safe.slice(3, 5), 16),
        parseInt(safe.slice(5, 7), 16),
    ];
}

function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value);
}
