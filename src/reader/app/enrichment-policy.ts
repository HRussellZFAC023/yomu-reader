import { isKanjiCharacter } from '../popup/pitch';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import {
    backgroundPitchEnrichmentOptionsForHost,
    nestedPitchEnrichmentOptionsForHost,
    PITCH_ENRICHMENT_LIMIT,
    type PitchEnrichmentOptions,
} from './main-helpers';
import type { JPDBCard, ReaderColorSource, ReaderSettings } from './types';

// Enrichment Policy: what the background lanes may fetch for words the
// learner has not opened. Needed work (a word's reading and identity) runs;
// merely wanted work (a pitch contour scraped from jpdb.io) runs only when a
// colour channel paints it. Pitch for an opened popup always runs, through the
// urgent path, whatever this says (ADR-0034).

export type EnrichmentSurface = 'page' | 'subtitle';

type ColorChannelSettings = Pick<ReaderSettings,
    | 'wordHighlightColorSource' | 'wordUnderlineColorSource' | 'wordTextColorSource'
    | 'subtitleHighlightColorSource' | 'subtitleUnderlineColorSource' | 'subtitleTextColorSource'>;

/** Where the reader runs: the settings, the page's host, and its viewport. */
export interface EnrichmentContext {
    settings: ColorChannelSettings & Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'>;
    hostname: string;
    compactViewport: boolean;
    // A video page (YouTube): comments and captions re-render all the time.
    videoPage: boolean;
}

const SURFACE_CHANNELS: Readonly<Record<EnrichmentSurface, ReadonlyArray<keyof ColorChannelSettings>>> = {
    page: ['wordHighlightColorSource', 'wordUnderlineColorSource', 'wordTextColorSource'],
    subtitle: ['subtitleHighlightColorSource', 'subtitleUnderlineColorSource', 'subtitleTextColorSource'],
};

// Grammar words a background lane never sends to jpdb.io for pitch: their
// contour depends on the word they attach to, and every page is full of them.
const PUBLIC_PITCH_AUXILIARIES = new Set(['する', 'です', 'ます', 'だ', 'である', 'でした', 'でしょう', 'ました', 'ません']);

export function surfacePaintsPitch(settings: Partial<ColorChannelSettings>, surface: EnrichmentSurface): boolean {
    return SURFACE_CHANNELS[surface].some(key => (settings[key] as ReaderColorSource | undefined) === 'pitch');
}

/**
 * A surface's background options under the policy. Without a pitch channel on
 * that surface no jpdb.io pitch page is fetched. Subtitles, and the rest of a
 * video page (comments re-render all the time), also skip jpdb.io word
 * searches: a caption line must not wait on scraped HTML.
 */
export function backgroundEnrichmentOptions(
    options: PitchEnrichmentOptions,
    settings: Partial<ColorChannelSettings>,
    surface: EnrichmentSurface,
    videoPage = false,
): PitchEnrichmentOptions {
    if (surfacePaintsPitch(settings, surface)) return options;
    return surface === 'subtitle' || videoPage
        ? { ...options, publicPitch: false, jpdbPublicLookup: false }
        : { ...options, publicPitch: false };
}

/** The urgent popup path leaves publicPitch unset, so it always may. */
export function allowsPublicPitch(options: Pick<PitchEnrichmentOptions, 'publicPitch'>): boolean {
    return options.publicPitch !== false;
}

/**
 * Whether a card may be sent to jpdb.io for its pitch at all. An inflected
 * segmented fallback (見ました, with its guesses 見る and 見まする) names no
 * dictionary entry jpdb.io could match; an uninflected one (もう一度) may.
 * Auxiliaries are grammar.
 */
export function isPublicPitchCandidate(card: Pick<JPDBCard, 'source' | 'spelling' | 'fallbackLookupTerms'>): boolean {
    if (card.source === 'fallback' && card.fallbackLookupTerms?.length) return false;
    return !PUBLIC_PITCH_AUXILIARIES.has(card.spelling.trim());
}

/**
 * Whether a background lane may search jpdb.io for a fallback word's identity:
 * only a word that needs a reading, which is a word with kanji in it. Kana
 * words keep their Jiten answer, and the popup resolves them when opened.
 */
export function needsPublicIdentitySearch(surface: string): boolean {
    return [...surface].some(isKanjiCharacter);
}

/**
 * The paced deferred lane retries what a visible pass left over, for the
 * surface the word was shown on. Where a pitch channel paints that surface it
 * finishes pitch; elsewhere it only gives a fallback word with kanji its
 * identity, through Jiten. Subtitles painting pitch fetch nothing for the page.
 */
export function isDeferredPublicLaneToken(
    token: { card: Pick<JPDBCard, 'source' | 'spelling'>; sentence?: string; start: number; end: number },
    settings: Partial<ColorChannelSettings>,
    surface: EnrichmentSurface,
): boolean {
    if (surfacePaintsPitch(settings, surface)) return true;
    if (token.card.source !== 'fallback') return false;
    return needsPublicIdentitySearch(token.sentence?.slice(token.start, token.end) || token.card.spelling);
}

export function deferredPublicLaneOptions(
    batchLength: number,
    settings: Partial<ColorChannelSettings>,
    surface: EnrichmentSurface,
): PitchEnrichmentOptions {
    // publicLookup: true — the lane exists to do the paced public retry; the
    // local-dictionary override would otherwise force it offline again.
    const options: PitchEnrichmentOptions = { publicLookupLimit: batchLength, publicLookup: true };
    return surfacePaintsPitch(settings, surface) ? options : { ...options, publicPitch: false, jpdbPublicLookup: false };
}

const hasApiCredential = (settings: EnrichmentContext['settings']): boolean =>
    hasJpdbApiCredential(settings) || hasJitenApiCredential(settings);

// The host's background budgets; keyless readers resolve every visible word
// within the batch and page budgets (budgets and pacing are the DOS guard, so
// do not widen them).
function hostBackgroundOptions({ settings, hostname, compactViewport }: EnrichmentContext): PitchEnrichmentOptions {
    const options = backgroundPitchEnrichmentOptionsForHost(hostname, compactViewport);
    if (hasApiCredential(settings)) return options;
    const pageBudget = Math.max(0, Math.floor(options.publicLookupPageBudget ?? PITCH_ENRICHMENT_LIMIT));
    const keylessVisibleLimit = pageBudget || PITCH_ENRICHMENT_LIMIT;
    return {
        ...options,
        publicLookupLimit: Math.max(Math.floor(options.publicLookupLimit ?? 0), keylessVisibleLimit),
        publicLookupTotalLimit: Math.max(Math.floor(options.publicLookupTotalLimit ?? 0), keylessVisibleLimit),
    };
}

/** A visible pass over the page (or the subtitles, for 'subtitle'). */
export function backgroundPassOptions(context: EnrichmentContext, surface: EnrichmentSurface = 'page'): PitchEnrichmentOptions {
    return backgroundEnrichmentOptions(hostBackgroundOptions(context), context.settings, surface, context.videoPage);
}

/** Words inside the reader's own content: popup sentences, related words. */
export function nestedPassOptions(context: EnrichmentContext): PitchEnrichmentOptions {
    return backgroundEnrichmentOptions(nestedPitchEnrichmentOptionsForHost(context.hostname), context.settings, 'page', context.videoPage);
}

/**
 * The pass a subtitle line waits for before it renders. Without a subtitle
 * pitch channel it asks Jiten only: no jpdb.io page holds a caption back.
 */
export function subtitleBeforeRenderOptions(context: EnrichmentContext): PitchEnrichmentOptions {
    const background = hostBackgroundOptions(context);
    const noApiCredential = !hasApiCredential(context.settings);
    const isolateKeylessVideoBudget = noApiCredential && context.videoPage;
    const urgentPublicLimit = noApiCredential ? PITCH_ENRICHMENT_LIMIT * 4 : 2;
    const backgroundPublicLimit = isolateKeylessVideoBudget ? urgentPublicLimit : background.publicLookupLimit;
    const backgroundPublicTotalLimit = isolateKeylessVideoBudget ? urgentPublicLimit : background.publicLookupTotalLimit;
    const publicLookupLimit = Math.min(urgentPublicLimit, Math.max(0, Math.floor(backgroundPublicLimit ?? urgentPublicLimit)));
    const publicLookupTotalLimit = Math.min(publicLookupLimit, Math.max(0, Math.floor(backgroundPublicTotalLimit ?? publicLookupLimit)));
    // dictionaryFirstFallbackLookupTerms can put malformed shallow
    // deinflections before the real lemma (訪れた -> 訪る, 訪れる). Keep the
    // same bounded three-candidate window as background enrichment so the
    // exact-match Jiten guard can reject a partial first hit and still reach
    // the real reading/pitch before authoritative subtitle HTML is painted.
    const publicLookupTermLimit = Math.max(3, Math.floor(background.publicLookupTermLimit ?? 3));
    return backgroundEnrichmentOptions({
        ...background,
        urgent: true,
        ...(isolateKeylessVideoBudget ? { jpdbPublicLookup: true } : {}),
        publicLookupLimit,
        publicLookupTotalLimit,
        publicLookupPageBudget: isolateKeylessVideoBudget ? undefined : background.publicLookupPageBudget,
        publicLookupTermLimit,
        deferPublicLookup: false,
    }, context.settings, 'subtitle');
}

/** The pass recognised OCR text waits for: keyless, it stays local. */
export function ocrBeforeRenderOptions({ settings }: EnrichmentContext): PitchEnrichmentOptions {
    return {
        urgent: true,
        ...(hasJpdbApiCredential(settings) ? {} : { jpdbPublicLookup: false }),
        ...(hasApiCredential(settings) ? {} : { publicLookup: false }),
    };
}
