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

        expect(isDeferredPublicLaneToken(kanjiGuess, DEFAULT_SETTINGS)).toBe(true);
        expect(isDeferredPublicLaneToken(kanaGuess, DEFAULT_SETTINGS)).toBe(false);
        expect(isDeferredPublicLaneToken(parsed, DEFAULT_SETTINGS)).toBe(false);
        expect(isDeferredPublicLaneToken(parsed, pagePitch)).toBe(true);
        expect(deferredPublicLaneOptions(4, DEFAULT_SETTINGS)).toEqual({ publicLookupLimit: 4, publicLookup: true, publicPitch: false, jpdbPublicLookup: false });
        expect(deferredPublicLaneOptions(4, pagePitch)).toEqual({ publicLookupLimit: 4, publicLookup: true });
    });
});
