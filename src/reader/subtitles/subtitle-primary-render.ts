import { parsedSubtitleHtmlHasReaderWords } from './subtitle-parse-policy';
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
    const hasReusablePrimary = options.lastRenderedKey === options.parseKey
        && (parsedSubtitleHtmlHasReaderWords(options.lastRenderedHtml) || options.hasFreshEmptyParsedHtml);
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
