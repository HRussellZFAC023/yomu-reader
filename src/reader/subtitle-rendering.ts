import {
    cueHasExactWordTimings,
    escapeWithBreaks,
    karaokeCharacterProgress,
    renderKaraokeTextParts,
    type SubtitleCue,
} from './subtitle-cues';

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
    const karaokeActive = input.karaokeMode && cueHasExactWordTimings(activeCue);
    const parsedHasReaderWords = input.parsedHtml?.includes('jpdb-reader-word') ?? false;
    const mode = subtitlePrimaryRenderMode(input, karaokeActive, parsedHasReaderWords);
    return {
        html: renderSubtitlePrimaryHtml(input, mode),
        karaokeActive,
        shouldRequestParse: input.hasParser && !input.parsedHtml,
        nextRenderedPrimary: nextRenderedPrimaryCache(input, karaokeActive),
    };
}

type SubtitlePrimaryRenderMode = 'parsed-karaoke' | 'karaoke' | 'parsed' | 'cached-parser' | 'loading-parser' | 'plain';

function subtitlePrimaryRenderMode(
    input: SubtitlePrimaryRenderInput,
    karaokeActive: boolean,
    parsedHasReaderWords: boolean,
): SubtitlePrimaryRenderMode {
    if (hasParsedKaraokeRender(karaokeActive, parsedHasReaderWords)) return 'parsed-karaoke';
    if (hasPlainKaraokeRender(input, karaokeActive)) return 'karaoke';
    if (input.parsedHtml) return 'parsed';
    if (hasReusablePrimaryParserCache(input)) return 'cached-parser';
    return parserFallbackRenderMode(input.hasParser);
}

function hasParsedKaraokeRender(karaokeActive: boolean, parsedHasReaderWords: boolean): boolean {
    return karaokeActive && parsedHasReaderWords;
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
    if (mode === 'parsed-karaoke' || mode === 'parsed') return input.parsedHtml ?? '';
    if (mode === 'karaoke') return renderSubtitleKaraokeCue(input.cue, input.time);
    if (mode === 'cached-parser') return input.lastRenderedHtml;
    if (mode === 'loading-parser') return `<span class="jpdb-subtitle-primary-loading">${escapeWithBreaks(input.text)}</span>`;
    return escapeWithBreaks(input.text);
}

function nextRenderedPrimaryCache(input: SubtitlePrimaryRenderInput, karaokeActive: boolean): SubtitlePrimaryRenderResult['nextRenderedPrimary'] {
    if (input.parsedHtml) return { text: input.text, html: input.parsedHtml };
    return karaokeActive ? { text: input.text, html: '' } : undefined;
}

export function renderSubtitleSecondary(text: string, nativeBlurred: boolean): string {
    const blurClass = nativeBlurred ? 'jpdb-subtitle-secondary-blurred' : 'jpdb-subtitle-secondary-clear';
    return `<button class="jpdb-subtitle-secondary ${blurClass}" type="button" data-action="toggle-native-blur" title="Toggle native subtitle blur" aria-label="Toggle native subtitle blur">${escapeWithBreaks(text)}</button>`;
}

export function renderSubtitleKaraokeCue(cue: SubtitleCue | undefined, time: number): string {
    if (!cue?.text.trim()) return '';
    if (!cueHasExactWordTimings(cue)) return escapeWithBreaks(cue.text);
    const words = cue.words;
    if (!words.length) return '';
    const progress = karaokeCharacterProgress(cue, words, time);
    return renderKaraokeTextParts(cue.text, progress);
}
