import {
    accentToRgba,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveSubtitleColorSource,
    effectiveWordHighlightMode,
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
    wordHighlightMode: ReturnType<typeof effectiveWordHighlightMode>;
    wordColorSources: ColorSourceMap;
    subtitleColorSources: ColorSourceMap;
}

export function applyReaderTheme(settings: ReaderSettings, root = document.documentElement): AppliedReaderTheme {
    applyReaderAccentColor(settings.accentColor, root);
    applyReaderWordColors(settings, root);
    const theme = appliedReaderTheme(settings);
    root.classList.toggle('jpdb-reader-theme-dark', settings.theme === 'dark');
    root.classList.toggle('jpdb-reader-theme-light', settings.theme === 'light');
    root.classList.toggle('jpdb-reader-hide-known', theme.furiganaMode === 'known-status');
    root.classList.toggle('jpdb-reader-highlight-status', theme.wordHighlightMode === 'status');
    root.classList.toggle('jpdb-reader-highlight-pitch', theme.wordHighlightMode === 'pitch');
    root.classList.toggle('jpdb-reader-highlight-off', theme.wordHighlightMode === 'off');
    applyReaderColorSourceClasses(root, 'word', theme.wordColorSources);
    applyReaderColorSourceClasses(root, 'subtitle', theme.subtitleColorSources);
    return theme;
}

export function applyReaderAccentColor(color: string, root = document.documentElement): void {
    const accentColor = sanitizeAccentColor(color);
    root.style.setProperty('--jpdb-reader-accent', accentColor);
    root.style.setProperty('--jpdb-reader-accent-soft', accentToRgba(accentColor, 0.18));
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
        wordHighlightMode: effectiveWordHighlightMode(settings),
        wordColorSources: {
            highlight: effectiveReaderColorSource(settings, settings.wordHighlightColorSource),
            underline: effectiveReaderColorSource(settings, settings.wordUnderlineColorSource),
            text: effectiveReaderColorSource(settings, settings.wordTextColorSource),
        },
        subtitleColorSources: {
            highlight: effectiveSubtitleColorSource(settings, settings.subtitleHighlightColorSource),
            underline: effectiveSubtitleColorSource(settings, settings.subtitleUnderlineColorSource),
            text: effectiveSubtitleColorSource(settings, settings.subtitleTextColorSource),
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
