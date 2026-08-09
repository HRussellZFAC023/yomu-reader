import { renderSubtitlePrimary } from './subtitle-rendering';
import type { SubtitleCue } from './subtitle-cues';
import type { ReaderSettings } from '../app/types';

export interface SubtitlePrimaryRenderOptions {
    cue: SubtitleCue | undefined;
    text: string;
    settings: ReaderSettings;
    parseKey: string;
    parsedHtml: string | undefined;
    lastRenderedKey: string;
    lastRenderedText: string;
    lastRenderedHtml: string;
    hasFreshEmptyParsedHtml: boolean;
    hasParser: boolean;
    time: number;
}

export function renderControllerPrimarySubtitle(options: SubtitlePrimaryRenderOptions): ReturnType<typeof renderSubtitlePrimary> {
    const hasReusablePrimary = rendersTheSameCue(options)
        && (Boolean(options.lastRenderedHtml) || options.hasFreshEmptyParsedHtml);
    return renderSubtitlePrimary({
        cue: options.cue,
        text: options.text,
        parsedHtml: options.parsedHtml,
        hasParser: options.hasParser,
        lastRenderedText: hasReusablePrimary ? options.lastRenderedText : '',
        lastRenderedHtml: hasReusablePrimary ? options.lastRenderedHtml : '',
        karaokeMode: options.settings.subtitleKaraokeMode,
        time: options.time,
    });
}

// The parse key includes both cue text and every render-affecting setting. It
// is the identity of a reusable visual commit: text alone would retain stale
// furigana, pitch, or colour markup after a learner changes those settings.
function rendersTheSameCue(options: SubtitlePrimaryRenderOptions): boolean {
    return options.lastRenderedKey === options.parseKey
        && options.lastRenderedText === options.text;
}
