// Pure lookup/parse/pitch helper functions for ReaderApp (src/reader/app/main.ts).
// Everything here is stateless: no ReaderApp instance state, only inputs to outputs.
import { cardKey } from '../cards/utils';
import { type ReaderParserParseOptions } from '../lookup/parser';
import { contextPitchPattern } from '../lookup/pitch-accent';
import { type PointerTextSpanCandidate } from '../lookup/pointer-text-lookup';
import { normalizedLookupText } from '../lookup/text-helpers';
import { cardPronunciationReading } from '../popup/pitch';
import { PITCH_ENRICHMENT_LIMIT, isYouTubeHostname, type PitchEnrichmentOptions } from './main-helpers';
import { JPDBCard, JPDBToken, ReaderSettings } from './types';

export function uniqueTokensByCard(tokens: JPDBToken[]): JPDBToken[] {
    const seen = new Set<string>();
    return tokens.filter(token => {
        const key = cardKey(token.card);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function normalizedNestedParseOptions(options: ReaderParserParseOptions, _settings: ReaderSettings): Required<ReaderParserParseOptions> {
    const apiTimeoutMs = nestedParseApiTimeoutMs(options);
    const allowApiTimeoutFallback = nestedParseAllowApiTimeoutFallback(options);
    const skipApi = nestedParseSkipApi(options);
    const requireApi = nestedParseRequireApi(options, skipApi);
    return {
        apiTimeoutMs,
        allowApiTimeoutFallback,
        jpdbTimeoutMs: options.jpdbTimeoutMs ?? apiTimeoutMs,
        allowJpdbTimeoutFallback: options.allowJpdbTimeoutFallback ?? allowApiTimeoutFallback,
        includeLocalPitch: options.includeLocalPitch ?? false,
        skipApi,
        skipJpdb: options.skipJpdb ?? skipApi,
        requireApi,
        requireJpdb: options.requireJpdb ?? requireApi,
        // Remote identity and local boundary repair are complementary. API
        // credentials used to disable this pass, leaving dictionary examples
        // with the same partial-name misparses as credentialed subtitles.
        allowSegmentedFallback: options.allowSegmentedFallback ?? true,
    };
}

function nestedParseApiTimeoutMs(options: ReaderParserParseOptions): number {
    return options.apiTimeoutMs ?? options.jpdbTimeoutMs ?? 1_200;
}

export function waitForHoverCardInitialPaint(): Promise<void> {
    return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

function nestedParseAllowApiTimeoutFallback(options: ReaderParserParseOptions): boolean {
    return options.allowApiTimeoutFallback ?? options.allowJpdbTimeoutFallback ?? false;
}

function nestedParseSkipApi(options: ReaderParserParseOptions): boolean {
    return options.skipApi ?? options.skipJpdb ?? false;
}

function nestedParseRequireApi(options: ReaderParserParseOptions, skipApi: boolean): boolean {
    return options.requireApi ?? options.requireJpdb ?? !skipApi;
}

export function isYouTubeRuntimeHost(hostname = location.hostname): boolean {
    return isYouTubeHostname(hostname);
}

export function isCompactPitchEnrichmentViewport(): boolean {
    return window.innerWidth <= 700 || navigator.maxTouchPoints > 1;
}

export function pitchEnrichmentQueueOptions(
    options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>,
): Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> {
    return {
        publicLookup: options.publicLookup,
        publicLookupTermLimit: options.publicLookupTermLimit,
        jpdbPublicLookup: options.jpdbPublicLookup,
        urgent: options.urgent,
    };
}

const SUBSTANTIVE_PUBLIC_PITCH_LOOKUP_RE = /[\u3400-\u9fff々〆ヵヶ]|[\u30a0-\u30ffー]{2,}|[\u3040-\u309fー]{2,}/u;

export function isSubstantivePublicPitchLookupToken(token: JPDBToken): boolean {
    const surface = token.sentence?.slice(token.start, token.end) ?? '';
    return SUBSTANTIVE_PUBLIC_PITCH_LOOKUP_RE.test(token.card.spelling)
        || SUBSTANTIVE_PUBLIC_PITCH_LOOKUP_RE.test(token.card.reading)
        || SUBSTANTIVE_PUBLIC_PITCH_LOOKUP_RE.test(surface);
}

export function publicLookupCardRequest(
    readingOrOptions: string | { allowCandidateLookup?: boolean },
    maybeOptions: { allowCandidateLookup?: boolean },
): { options: { allowCandidateLookup?: boolean }; reading: string } {
    return typeof readingOrOptions === 'string'
        ? { options: maybeOptions, reading: readingOrOptions }
        : { options: readingOrOptions, reading: '' };
}

export function canSearchPublicLookupCard(settings: ReaderSettings, options: { allowCandidateLookup?: boolean }): boolean {
    return Boolean(
        options.allowCandidateLookup
        || settings.jpdbDefinitionsEnabled
        || settings.showPitchAccent
        || (settings.showFurigana && settings.furiganaMode !== 'off'),
    );
}

export function publicLookupSearchLimit(reading: string): number {
    return reading ? 12 : 1;
}

export function publicLookupCardFromResults(cards: JPDBCard[], term: string, exact: boolean, reading: string): JPDBCard | undefined {
    if (reading) return cards.find(card => card.spelling === term && card.reading === reading);
    const exactMatch = cards.find(card => card.spelling === term || card.reading === term);
    return exactMatch ?? (exact ? undefined : cards[0]);
}

export function publicJitenDetailLimit(requested: number): number {
    return Math.min(Math.max(0, Math.floor(requested)), PITCH_ENRICHMENT_LIMIT * 2);
}

export function isHydratablePublicJitenCard(card: JPDBCard): boolean {
    return card.source === 'jiten'
        && Number.isFinite(card.jitenWordId ?? card.vid)
        && Number.isFinite(card.jitenReadingIndex ?? card.sid)
        && (!card.reading || !card.pitchAccent.length || !card.wordWithReading || !card.meanings.length);
}

export function uniquePointerTextSpans(spans: PointerTextSpanCandidate[]): PointerTextSpanCandidate[] {
    const seen = new Set<string>();
    return spans.filter(span => {
        const key = `${span.term}\n${span.start}\n${span.end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function pointerSpanForResolvedCard(text: string, offset: number, span: PointerTextSpanCandidate, card: JPDBCard): PointerTextSpanCandidate {
    const surface = normalizedLookupText(text.slice(span.start, span.end));
    if (!surface) return span;
    const values = [...new Set([card.spelling, card.reading].map(normalizedLookupText).filter(Boolean))]
        .sort((first, second) => second.length - first.length);
    for (const value of values) {
        const relativeStart = surface.indexOf(value);
        if (relativeStart < 0) continue;
        const start = span.start + relativeStart;
        const end = start + value.length;
        if (offset < start || offset >= end) continue;
        return { ...span, start, end };
    }
    return span;
}

// "Has pitch" for enrichment means a pattern that actually fits the card's
// contextual reading; a Jiten/local pattern for a different reading (e.g.
// dictionary form) should still fall through to the JPDB pitch lookup.
export function cardHasContextPitch(card: JPDBCard): boolean {
    if (!card.pitchAccent.length) return false;
    const reading = cardPronunciationReading(card);
    if (!reading) return true;
    return Boolean(contextPitchPattern(card.pitchAccent, reading));
}

export function mergePitchPatterns(preferred: string[], existing: string[]): string[] {
    return [...preferred, ...existing.filter(pattern => !preferred.includes(pattern))];
}
