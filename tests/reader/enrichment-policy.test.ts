import { describe, expect, it } from 'vitest';
import {
    backgroundEnrichmentOptions,
    deferredPublicLaneOptions,
    isDeferredPublicLaneToken,
    isPublicPitchCandidate,
    needsPublicIdentitySearch,
    surfacePaintsPitch,
} from '../../src/reader/app/enrichment-policy';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard } from '../../src/reader/app/types';

const pagePitch = { ...DEFAULT_SETTINGS, wordUnderlineColorSource: 'pitch' as const };
const subtitlePitch = { ...DEFAULT_SETTINGS, subtitleTextColorSource: 'pitch' as const };
const budget = { publicLookupLimit: 10, publicLookupPageBudget: 40 };

function card(spelling: string, source: JPDBCard['source'], fallbackLookupTerms?: string[]): Pick<JPDBCard, 'source' | 'spelling' | 'fallbackLookupTerms'> {
    return { spelling, source, fallbackLookupTerms };
}

describe('Enrichment Policy', () => {
    it('finds pitch painted only where one of the surface\'s three channels is set to it', () => {
        expect(surfacePaintsPitch(DEFAULT_SETTINGS, 'page')).toBe(false);
        expect(surfacePaintsPitch(DEFAULT_SETTINGS, 'subtitle')).toBe(false);
        expect(surfacePaintsPitch(pagePitch, 'page')).toBe(true);
        expect(surfacePaintsPitch(pagePitch, 'subtitle')).toBe(false);
        expect(surfacePaintsPitch(subtitlePitch, 'subtitle')).toBe(true);
    });

    it('keeps background passes off jpdb.io pitch pages unless the surface paints pitch', () => {
        expect(backgroundEnrichmentOptions(budget, DEFAULT_SETTINGS, 'page')).toEqual({ ...budget, publicPitch: false });
        expect(backgroundEnrichmentOptions(budget, pagePitch, 'page')).toBe(budget);
        expect(backgroundEnrichmentOptions(budget, subtitlePitch, 'subtitle')).toBe(budget);
    });

    it('keeps subtitles and video pages off jpdb.io altogether without a pitch channel', () => {
        const offJpdb = { ...budget, publicPitch: false, jpdbPublicLookup: false };
        expect(backgroundEnrichmentOptions(budget, DEFAULT_SETTINGS, 'subtitle')).toEqual(offJpdb);
        expect(backgroundEnrichmentOptions(budget, pagePitch, 'subtitle')).toEqual(offJpdb);
        expect(backgroundEnrichmentOptions(budget, DEFAULT_SETTINGS, 'page', true)).toEqual(offJpdb);
    });

    it('never sends a segmenter guess or a grammar word to jpdb.io for pitch', () => {
        expect(isPublicPitchCandidate(card('見ました', 'fallback', ['見る', '見まする']))).toBe(false);
        expect(isPublicPitchCandidate(card('もう一度', 'fallback'))).toBe(true);
        expect(isPublicPitchCandidate(card('する', 'jiten'))).toBe(false);
        expect(isPublicPitchCandidate(card('です', 'jpdb'))).toBe(false);
        expect(isPublicPitchCandidate(card('復習', 'jiten'))).toBe(true);
    });

    it('searches jpdb.io for a word\'s identity only when it needs a reading', () => {
        expect(needsPublicIdentitySearch('ありがと')).toBe(false);
        expect(needsPublicIdentitySearch('見ました')).toBe(true);
    });

    it('admits to the paced lane only what it may still fetch', () => {
        const kanjiGuess = { card: card('見る', 'fallback'), sentence: '見ました', start: 0, end: 4 };
        const kanaGuess = { card: card('ありがつ', 'fallback'), sentence: 'ありがと', start: 0, end: 4 };
        const parsed = { card: card('復習', 'jiten'), start: 0, end: 2 };

        expect(isDeferredPublicLaneToken(kanjiGuess, DEFAULT_SETTINGS, 'page')).toBe(true);
        expect(isDeferredPublicLaneToken(kanaGuess, DEFAULT_SETTINGS, 'page')).toBe(false);
        expect(isDeferredPublicLaneToken(parsed, DEFAULT_SETTINGS, 'page')).toBe(false);
        expect(isDeferredPublicLaneToken(parsed, pagePitch, 'page')).toBe(true);
        expect(deferredPublicLaneOptions(4, DEFAULT_SETTINGS, 'page')).toEqual({ publicLookupLimit: 4, publicLookup: true, publicPitch: false, jpdbPublicLookup: false });
        expect(deferredPublicLaneOptions(4, pagePitch, 'page')).toEqual({ publicLookupLimit: 4, publicLookup: true });
    });

    it('keeps the paced lane to the surface the word was shown on', () => {
        const kanaPage = { card: card('ウィキペディア', 'jiten'), start: 0, end: 7 };
        const offJpdb = { publicLookupLimit: 4, publicLookup: true, publicPitch: false, jpdbPublicLookup: false };

        // Subtitles painting pitch fetch nothing for an article's words, and the
        // page painting pitch fetches nothing for a caption's.
        expect(isDeferredPublicLaneToken(kanaPage, subtitlePitch, 'page')).toBe(false);
        expect(deferredPublicLaneOptions(4, subtitlePitch, 'page')).toEqual(offJpdb);
        expect(isDeferredPublicLaneToken(kanaPage, pagePitch, 'subtitle')).toBe(false);
        expect(deferredPublicLaneOptions(4, pagePitch, 'subtitle')).toEqual(offJpdb);
        expect(isDeferredPublicLaneToken(kanaPage, subtitlePitch, 'subtitle')).toBe(true);
        expect(deferredPublicLaneOptions(4, subtitlePitch, 'subtitle')).toEqual({ publicLookupLimit: 4, publicLookup: true });
        // Identity hydration stays available even when the other surface is
        // the only one painting pitch.
        const kanjiPage = { card: card('復習', 'fallback'), start: 0, end: 2 };
        expect(isDeferredPublicLaneToken(kanjiPage, subtitlePitch, 'page')).toBe(true);
    });

    it.each([
        ['wordHighlightColorSource', 'page', 'subtitle'],
        ['wordUnderlineColorSource', 'page', 'subtitle'],
        ['wordTextColorSource', 'page', 'subtitle'],
        ['subtitleHighlightColorSource', 'subtitle', 'page'],
        ['subtitleUnderlineColorSource', 'subtitle', 'page'],
        ['subtitleTextColorSource', 'subtitle', 'page'],
    ] as const)('keeps deferred %s pitch on its own surface', (channel, shown, other) => {
        const settings = { ...DEFAULT_SETTINGS, [channel]: 'pitch' as const };
        expect(deferredPublicLaneOptions(1, settings, shown).publicPitch).toBeUndefined();
        expect(deferredPublicLaneOptions(1, settings, other).publicPitch).toBe(false);
        expect(deferredPublicLaneOptions(1, DEFAULT_SETTINGS, shown).publicPitch).toBe(false);
    });
});
