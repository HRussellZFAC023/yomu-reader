import {
    cueHasExactWordTimings,
    escapeWithBreaks,
    karaokeCharacterProgress,
    renderKaraokeTextParts,
    type SubtitleCue,
} from './subtitle-cues';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';

export interface SubtitlePrimaryRenderInput {
    cue?: SubtitleCue;
    text: string;
    parsedHtml?: string;
    hasParser: boolean;
    lastRenderedText: string;
    lastRenderedHtml: string;
    karaokeMode: boolean;
    time: number;
}

export interface SubtitlePrimaryRenderResult {
    html: string;
    karaokeActive: boolean;
    shouldRequestParse: boolean;
    nextRenderedPrimary?: { text: string; html: string };
}

export function renderSubtitlePrimary(input: SubtitlePrimaryRenderInput): SubtitlePrimaryRenderResult {
    const activeCue = input.cue;
    const parsedHasReaderWords = input.parsedHtml?.includes('jpdb-reader-word') ?? false;
    const karaokeActive = input.karaokeMode && cueHasExactWordTimings(activeCue);
    const mode = subtitlePrimaryRenderMode(input, karaokeActive, parsedHasReaderWords);
    return {
        html: renderSubtitlePrimaryHtml(input, mode),
        karaokeActive,
        shouldRequestParse: input.hasParser && !input.parsedHtml,
        nextRenderedPrimary: nextRenderedPrimaryCache(input, karaokeActive),
    };
}

type SubtitlePrimaryRenderMode = 'karaoke' | 'parsed' | 'cached-parser' | 'loading-parser' | 'plain';

function subtitlePrimaryRenderMode(
    input: SubtitlePrimaryRenderInput,
    karaokeActive: boolean,
    parsedHasReaderWords: boolean,
): SubtitlePrimaryRenderMode {
    if (parsedHasReaderWords) return 'parsed';
    if (hasPlainKaraokeRender(input, karaokeActive)) return 'karaoke';
    if (input.parsedHtml) return 'parsed';
    if (hasReusablePrimaryParserCache(input)) return 'cached-parser';
    return parserFallbackRenderMode(input.hasParser);
}

function hasPlainKaraokeRender(input: SubtitlePrimaryRenderInput, karaokeActive: boolean): boolean {
    return Boolean(karaokeActive && input.cue);
}

function parserFallbackRenderMode(hasParser: boolean): SubtitlePrimaryRenderMode {
    return hasParser ? 'loading-parser' : 'plain';
}

function hasReusablePrimaryParserCache(input: SubtitlePrimaryRenderInput): boolean {
    return Boolean(input.hasParser && input.lastRenderedText === input.text && input.lastRenderedHtml);
}

function renderSubtitlePrimaryHtml(input: SubtitlePrimaryRenderInput, mode: SubtitlePrimaryRenderMode): string {
    return SUBTITLE_PRIMARY_RENDERERS[mode](input);
}

const SUBTITLE_PRIMARY_RENDERERS: Record<SubtitlePrimaryRenderMode, (input: SubtitlePrimaryRenderInput) => string> = {
    parsed: input => input.parsedHtml ?? '',
    karaoke: input => renderSubtitleKaraokeCue(input.cue, input.time),
    'cached-parser': input => input.lastRenderedHtml,
    'loading-parser': input => `<span class="jpdb-subtitle-primary-loading">${escapeWithBreaks(input.text)}</span>`,
    plain: input => escapeWithBreaks(input.text),
};

function nextRenderedPrimaryCache(input: SubtitlePrimaryRenderInput, karaokeActive: boolean): SubtitlePrimaryRenderResult['nextRenderedPrimary'] {
    if (input.parsedHtml) return { text: input.text, html: input.parsedHtml };
    return karaokeActive ? { text: input.text, html: '' } : undefined;
}

export const SUBTITLE_SECONDARY_BLURRED_CLASS = 'jpdb-subtitle-secondary-blurred';
export const SUBTITLE_SECONDARY_CLEAR_CLASS = 'jpdb-subtitle-secondary-clear';

// The line looks like plain caption text, so learners keep asking how to hide
// the translation. aria-pressed is the cheap, non-intrusive half of the answer:
// it makes the line announce as a toggle button that is currently on or off,
// instead of as an unexplained label, and it costs no new UI copy.
export function syncSubtitleSecondaryBlurState(button: HTMLElement, nativeBlurred: boolean, language: InterfaceLanguage = 'en'): void {
    button.classList.toggle(SUBTITLE_SECONDARY_BLURRED_CLASS, nativeBlurred);
    button.classList.toggle(SUBTITLE_SECONDARY_CLEAR_CLASS, !nativeBlurred);
    const label = uiText(language, 'toggleNativeSubtitleBlur');
    button.setAttribute('title', label);
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(nativeBlurred));
}

export function renderSubtitleSecondary(text: string, nativeBlurred: boolean, language: InterfaceLanguage = 'en'): string {
    const blurClass = nativeBlurred ? SUBTITLE_SECONDARY_BLURRED_CLASS : SUBTITLE_SECONDARY_CLEAR_CLASS;
    const label = uiText(language, 'toggleNativeSubtitleBlur');
    return `<button class="jpdb-subtitle-secondary ${blurClass}" type="button" data-action="toggle-native-blur" title="${label}" aria-label="${label}" aria-pressed="${nativeBlurred}">${escapeWithBreaks(text)}</button>`;
}

export function renderSubtitleKaraokeCue(cue: SubtitleCue | undefined, time: number): string {
    if (!cue?.text.trim()) return '';
    if (!cueHasExactWordTimings(cue)) return escapeWithBreaks(cue.text);
    const words = cue.words;
    if (!words.length) return '';
    const progress = karaokeCharacterProgress(cue, words, time);
    return renderKaraokeTextParts(cue.text, progress);
}
