import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import {
    apiGradingProviderPreference,
    apiSrsProviderAvailability,
    apiSrsProviderViewForCard,
} from '../../src/reader/cards/srs-providers';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return { ...DEFAULT_SETTINGS, ...overrides };
}

// Mirrors the reader's real backing rule so jiten-source cards are not jpdb-backed.
const isJpdbBackedCard = (card: JPDBCard): boolean => (!card.source || card.source === 'jpdb') && card.vid > 0;

const baseCard: JPDBCard = {
    vid: 1, sid: 2, rid: 3, spelling: '食べる', reading: 'たべる',
    frequencyRank: 100, partOfSpeech: ['v1'], meanings: [], cardState: ['not-in-deck'],
    pitchAccent: [], wordWithReading: null,
};

// A jpdb-parsed word that also resolved a Jiten identity (the lookup enrichment).
const dualCard: JPDBCard = { ...baseCard, source: 'jpdb', jitenWordId: 42, jitenReadingIndex: 0 };
const jpdbOnlyCard: JPDBCard = { ...baseCard, source: 'jpdb' };
const jitenCard: JPDBCard = { ...baseCard, source: 'jiten', vid: 42, sid: 0, jitenWordId: 42, jitenReadingIndex: 0 };

describe('apiGradingProviderPreference', () => {
    it('defaults to jiten and honors an explicit jpdb preference', () => {
        expect(apiGradingProviderPreference(settings())).toBe('jiten');
        expect(apiGradingProviderPreference(settings({ apiGradingProvider: 'jiten' }))).toBe('jiten');
        expect(apiGradingProviderPreference(settings({ apiGradingProvider: 'jpdb' }))).toBe('jpdb');
    });
});

describe('apiSrsProviderAvailability', () => {
    it('reports a provider available only when its key is set and the card carries its identity', () => {
        const bothKeys = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key' });
        expect(apiSrsProviderAvailability(dualCard, bothKeys, isJpdbBackedCard)).toEqual({ jpdb: true, jiten: true });
        expect(apiSrsProviderAvailability(jpdbOnlyCard, bothKeys, isJpdbBackedCard)).toEqual({ jpdb: true, jiten: false });
        expect(apiSrsProviderAvailability(jitenCard, bothKeys, isJpdbBackedCard)).toEqual({ jpdb: false, jiten: true });
        expect(apiSrsProviderAvailability(dualCard, settings({ apiKey: 'jpdb-key' }), isJpdbBackedCard)).toEqual({ jpdb: true, jiten: false });
    });
});

describe('apiSrsProviderViewForCard', () => {
    it('follows the toggled grading provider when both keys are set and the card is gradable by both', () => {
        const bothKeys = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key' });
        expect(apiSrsProviderViewForCard(dualCard, bothKeys, isJpdbBackedCard)?.id).toBe('jiten');
        expect(apiSrsProviderViewForCard(dualCard, { ...bothKeys, apiGradingProvider: 'jpdb' }, isJpdbBackedCard)?.id).toBe('jpdb');
    });

    it('uses whichever provider backs the card when only one is usable', () => {
        const bothKeys = settings({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key', apiGradingProvider: 'jiten' });
        // A jpdb-only word stays jpdb even when the preference is jiten.
        expect(apiSrsProviderViewForCard(jpdbOnlyCard, bothKeys, isJpdbBackedCard)?.id).toBe('jpdb');
        // A jiten word stays jiten even when the preference is jpdb.
        expect(apiSrsProviderViewForCard(jitenCard, { ...bothKeys, apiGradingProvider: 'jpdb' }, isJpdbBackedCard)?.id).toBe('jiten');
    });

    it('never drops a gradable JPDB word for a keyless Jiten view (single-key regression)', () => {
        // dualCard is keylessly enriched with a jiten identity, but only the JPDB
        // key is set — the gradable JPDB provider must win, with a usable key.
        const jpdbKeyOnly = settings({ apiKey: 'jpdb-key', jitenApiKey: '', apiGradingProvider: 'jiten' });
        const view = apiSrsProviderViewForCard(dualCard, jpdbKeyOnly, isJpdbBackedCard);
        expect(view?.id).toBe('jpdb');
        expect(view?.hasApiKey).toBe(true);
        // Mirror image: only the Jiten key is set → grade via Jiten.
        const jitenKeyOnly = settings({ apiKey: '', jitenApiKey: 'jiten-key', apiGradingProvider: 'jpdb' });
        expect(apiSrsProviderViewForCard(dualCard, jitenKeyOnly, isJpdbBackedCard)?.id).toBe('jiten');
    });

    it('reflects the key presence in hasApiKey', () => {
        expect(apiSrsProviderViewForCard(jpdbOnlyCard, settings({ apiKey: 'jpdb-key' }), isJpdbBackedCard)?.hasApiKey).toBe(true);
        expect(apiSrsProviderViewForCard(jpdbOnlyCard, settings({ apiKey: '' }), isJpdbBackedCard)?.hasApiKey).toBe(false);
    });
});
