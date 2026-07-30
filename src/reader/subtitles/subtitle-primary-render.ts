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
    holdLastAnnotatedWhilePending?: boolean;
    time: number;
}

export function renderControllerPrimarySubtitle(options: SubtitlePrimaryRenderOptions): ReturnType<typeof renderSubtitlePrimary> {
    if (shouldHoldLastAnnotatedPrimary(options)) {
        return {
            ...renderSubtitlePrimary({
                cue: undefined,
                text: options.lastRenderedText,
                parsedHtml: options.lastRenderedHtml,
                hasParser: options.hasParser,
                lastRenderedText: options.lastRenderedText,
                lastRenderedHtml: options.lastRenderedHtml,
                karaokeMode: false,
                time: options.time,
            }),
            shouldRequestParse: true,
        };
    }
    const hasReusablePrimary = rendersTheSameCue(options)
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

function shouldHoldLastAnnotatedPrimary(options: SubtitlePrimaryRenderOptions): boolean {
    return Boolean(options.holdLastAnnotatedWhilePending
        && options.cue
        && options.lastRenderedText !== options.text
        && parsedSubtitleHtmlHasReaderWords(options.lastRenderedHtml));
}

// Which cached render belongs to this cue is decided by the cue text, not by
// the parse key. The controller writes lastRenderedText and lastRenderedHtml as
// a pair on every render and clears them as a pair; lastRenderedKey is written
// on only one of those paths (the async parsed-apply) and cleared on none, so
// any cue whose parse was already warmed carries a previous cue's key. Judging
// reuse by that key threw the cached render away, and a tick that momentarily
// has no parsed html — the window while an authoritative parse upgrades a
// provisional one — then repainted the cue as plain unannotated text. That is
// the annotations arriving late (they return when the upgrade lands) or never
// (when it does not), plus a DOM rebuild each tick that wiped the
// asynchronously applied status colors. Text identity is the invariant that
// actually holds: it proves the cached html was rendered from this exact cue.
function rendersTheSameCue(options: SubtitlePrimaryRenderOptions): boolean {
    return options.lastRenderedText === options.text;
}
