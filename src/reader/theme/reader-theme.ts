import {
    accentToRgba,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveReaderTextColorSource,
    effectiveSubtitleColorSource,
    effectiveSubtitleTextColorSource,
    sanitizeAccentColor,
} from '../settings/index';
import { contrastRatio, isHexColor, mixHex, readableOnAll } from './color-utils';
import { READER_THEME_COLOR_TOKENS } from './color-tokens';
import type { ReaderColorSource, ReaderSettings } from '../app/types';

const COLOR_SOURCE_CLASSES: Exclude<ReaderColorSource, 'auto'>[] = ['status', 'jpdb', 'anki', 'pitch', 'off'];
const COLOR_CHANNELS = ['highlight', 'underline', 'text'] as const;
type ColorChannel = typeof COLOR_CHANNELS[number];
type AppliedColorSource = Exclude<ReaderColorSource, 'auto'>;
type ColorSourceMap = Record<ColorChannel, AppliedColorSource>;
const READER_THEME_COLORS = READER_THEME_COLOR_TOKENS;

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
    applyReaderImageTextOverlaySettings(settings, root);
    applyReaderSubtitleSettings(settings, root);
    applyReaderFontSettings(settings, root);
    applyPopupFontSettings(settings, root);
    root.classList.toggle('jpdb-reader-hide-known', theme.furiganaMode === 'known-status');
    root.classList.remove('jpdb-reader-highlight-status', 'jpdb-reader-highlight-pitch', 'jpdb-reader-highlight-off');
    applyReaderColorSourceClasses(root, 'word', theme.wordColorSources);
    applyReaderColorSourceClasses(root, 'subtitle', theme.subtitleColorSources);
    return theme;
}

function applyReaderFontSettings(settings: ReaderSettings, root: HTMLElement): void {
    root.style.setProperty('--jpdb-reader-font', settings.readerFontFamily);
}

function applyPopupFontSettings(settings: ReaderSettings, root: HTMLElement): void {
    root.style.setProperty('--jpdb-reader-popup-font', settings.popupFontFamily);
    root.style.setProperty('--jpdb-reader-popup-font-weight', String(settings.popupFontWeight));
}

function applyReaderImageTextOverlaySettings(settings: ReaderSettings, root: HTMLElement): void {
    const background = sanitizeAccentColor(settings.ocrBackgroundColor);
    const opacity = settings.ocrBackgroundOpacity;
    root.style.setProperty('--jpdb-ocr-text-color', sanitizeAccentColor(settings.ocrTextColor));
    root.style.setProperty('--jpdb-ocr-outline-color', sanitizeAccentColor(settings.ocrOutlineColor));
    root.style.setProperty('--jpdb-ocr-background-rgba', accentToRgba(background, opacity));
    root.style.setProperty('--jpdb-ocr-background-active-rgba', accentToRgba(background, Math.min(1, opacity + 0.12)));
}

function applyReaderSubtitleSettings(settings: ReaderSettings, root: HTMLElement): void {
    const background = sanitizeAccentColor(settings.subtitleBackgroundColor);
    root.style.setProperty('--subtitle-font-size-target', `${settings.subtitleFontSize}px`);
    root.style.setProperty('--subtitle-color', sanitizeAccentColor(settings.subtitleTextColor));
    root.style.setProperty('--subtitle-outline', sanitizeAccentColor(settings.subtitleOutlineColor));
    root.style.setProperty('--subtitle-background-rgba', accentToRgba(background, settings.subtitleBackgroundOpacity));
    root.style.setProperty('--subtitle-family', settings.subtitleFontFamily);
    root.style.setProperty('--subtitle-weight', String(settings.subtitleFontWeight));
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
        root.style.setProperty(`--jpdb-reader-state-${state}-readable`, readableThemeColorOnSurface(color, root));
        root.style.setProperty(`--jpdb-reader-state-${state}-soft`, accentToRgba(color, 0.16));
        root.style.setProperty(`--jpdb-reader-state-${state}-strong`, accentToRgba(color, 0.28));
    });
    Object.entries(readerPitchColors(settings)).forEach(([pattern, { color, alpha }]) => {
        root.style.setProperty(`--jpdb-reader-pitch-${pattern}`, color);
        root.style.setProperty(`--jpdb-reader-pitch-${pattern}-readable`, readableThemeColorOnSurface(color, root));
        root.style.setProperty(`--jpdb-reader-pitch-${pattern}-soft`, alpha > 0 ? accentToRgba(color, alpha) : 'transparent');
    });
}

function appliedReaderTheme(settings: ReaderSettings): AppliedReaderTheme {
    const wordColorSources = normalizedAppliedColorSources(settings, {
        highlight: effectiveReaderColorSource(settings, settings.wordHighlightColorSource, 'jpdb'),
        underline: effectiveReaderColorSource(settings, settings.wordUnderlineColorSource, 'pitch'),
        text: effectiveReaderTextColorSource(settings, settings.wordTextColorSource, 'anki'),
    }, 'word');
    const subtitleColorSources = normalizedAppliedColorSources(settings, {
        highlight: appliedSubtitleColorSource(settings, effectiveSubtitleColorSource(settings, settings.subtitleHighlightColorSource, 'jpdb')),
        underline: appliedSubtitleColorSource(settings, effectiveSubtitleColorSource(settings, settings.subtitleUnderlineColorSource, 'pitch')),
        text: appliedSubtitleColorSource(settings, effectiveSubtitleTextColorSource(settings, settings.subtitleTextColorSource, 'anki')),
    }, 'subtitle');
    return {
        furiganaMode: effectiveFuriganaMode(settings),
        wordColorSources,
        subtitleColorSources,
    };
}

function appliedSubtitleColorSource(settings: ReaderSettings, source: AppliedColorSource): AppliedColorSource {
    return source === 'status' ? effectiveReaderColorSource(settings, 'status', 'status') : source;
}

function normalizedAppliedColorSources(
    settings: ReaderSettings,
    sources: ColorSourceMap,
    scope: 'word' | 'subtitle',
): ColorSourceMap {
    if (sources.highlight !== 'pitch' || sources.underline !== 'pitch') return sources;
    return {
        ...sources,
        highlight: defaultHighlightSource(settings, scope),
    };
}

function defaultHighlightSource(settings: ReaderSettings, scope: 'word' | 'subtitle'): AppliedColorSource {
    if (scope === 'word') return effectiveReaderColorSource(settings, 'jpdb', 'jpdb');
    return appliedSubtitleColorSource(settings, effectiveSubtitleColorSource(settings, 'jpdb', 'jpdb'));
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
    return readableThemeColorOnSurface(accentColor, root);
}

function readableThemeColorOnSurface(color: string, root: HTMLElement): string {
    const surface = readerSurfaceColor(root);
    const safeColor = sanitizeAccentColor(color);
    return readableOnAll(safeColor, [
        surface,
        readerBackgroundColor(root),
        readerElevatedSurfaceColor(root),
        mixHex(surface, safeColor, 0.18),
        mixHex(surface, safeColor, 0.26),
    ], 4.5);
}

function readableTextOnAccent(accentColor: string): string {
    return contrastRatio(accentColor, READER_THEME_COLORS.dark.accentText) >= contrastRatio(accentColor, READER_THEME_COLORS.light.accentText)
        ? READER_THEME_COLORS.dark.accentText
        : READER_THEME_COLORS.light.accentText;
}

function readerSurfaceColor(root: HTMLElement): string {
    const computed = typeof getComputedStyle === 'function'
        ? getComputedStyle(root).getPropertyValue('--jpdb-reader-surface').trim()
        : '';
    if (isHexColor(computed)) return sanitizeAccentColor(computed);
    if (root.classList.contains('jpdb-reader-theme-dark')) return READER_THEME_COLORS.dark.surface;
    if (root.classList.contains('jpdb-reader-theme-light')) return READER_THEME_COLORS.light.surface;
    return prefersLightMode() ? READER_THEME_COLORS.light.surface : READER_THEME_COLORS.dark.surface;
}

function readerBackgroundColor(root: HTMLElement): string {
    const computed = typeof getComputedStyle === 'function'
        ? getComputedStyle(root).getPropertyValue('--jpdb-reader-bg').trim()
        : '';
    if (isHexColor(computed)) return sanitizeAccentColor(computed);
    if (root.classList.contains('jpdb-reader-theme-dark')) return READER_THEME_COLORS.dark.bg;
    if (root.classList.contains('jpdb-reader-theme-light')) return READER_THEME_COLORS.light.bg;
    return prefersLightMode() ? READER_THEME_COLORS.light.bg : READER_THEME_COLORS.dark.bg;
}

function readerElevatedSurfaceColor(root: HTMLElement): string {
    const computed = typeof getComputedStyle === 'function'
        ? getComputedStyle(root).getPropertyValue('--jpdb-reader-surface-2').trim()
        : '';
    if (isHexColor(computed)) return sanitizeAccentColor(computed);
    if (root.classList.contains('jpdb-reader-theme-dark')) return READER_THEME_COLORS.dark.surface2;
    if (root.classList.contains('jpdb-reader-theme-light')) return READER_THEME_COLORS.light.surface2;
    return prefersLightMode() ? READER_THEME_COLORS.light.surface2 : READER_THEME_COLORS.dark.surface2;
}

function prefersLightMode(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
}
