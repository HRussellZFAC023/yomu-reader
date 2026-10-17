import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings/index';
import { apiSrsProviderViewForCard, isApiMiningEnabled, isApiSrsProviderEnabled } from '../../src/reader/cards/srs-providers';
import { chosenWordGradingService } from '../../src/reader/settings/api-credential';
import { reviewServiceState, showsPreferredGradingService, type ReviewServiceFacts } from '../../src/reader/settings/review-services-panel';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

// "Allow API review/deck changes" (jpdbMiningEnabled) gated JPDB AND Jiten until
// 2.2. It became one "Grade from よむ" switch per service; a stored record
// written before then keeps its answer for both.
describe('Grade from よむ, per service', () => {
    it('migrates a stored shared switch to both JPDB and Jiten', () => {
        const off = normalizeReaderSettings({ jpdbMiningEnabled: false });
        expect([off.jpdbMiningEnabled, off.jitenMiningEnabled]).toEqual([false, false]);
        expect(isApiSrsProviderEnabled(off, 'jpdb')).toBe(false);
        expect(isApiSrsProviderEnabled(off, 'jiten')).toBe(false);

        const on = normalizeReaderSettings({ jpdbMiningEnabled: true });
        expect([on.jpdbMiningEnabled, on.jitenMiningEnabled]).toEqual([true, true]);
        expect(isApiSrsProviderEnabled(on, 'jpdb')).toBe(true);
        expect(isApiSrsProviderEnabled(on, 'jiten')).toBe(true);

        const fresh = normalizeReaderSettings({});
        expect([fresh.jpdbMiningEnabled, fresh.jitenMiningEnabled]).toEqual([true, true]);
    });

    it('keeps a saved per-service answer over the shared one', () => {
        const jitenOnly = normalizeReaderSettings({ jpdbMiningEnabled: false, jitenMiningEnabled: true });
        expect(isApiSrsProviderEnabled(jitenOnly, 'jpdb')).toBe(false);
        expect(isApiSrsProviderEnabled(jitenOnly, 'jiten')).toBe(true);
        expect(isApiMiningEnabled({ ...jitenOnly, bunproMiningEnabled: false, yomuLocalSrsEnabled: false })).toBe(true);
    });

    it('grades to the other service when the preferred one is switched off', () => {
        const both = (overrides: Partial<ReaderSettings>): ReaderSettings => ({
            ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jitenApiKey: 'ak_jiten-key', ...overrides,
        });
        expect(chosenWordGradingService(both({ apiGradingProvider: 'jiten' }))).toBe('jiten');
        expect(chosenWordGradingService(both({ apiGradingProvider: 'jiten', jitenMiningEnabled: false }))).toBe('jpdb');
        expect(chosenWordGradingService(both({ apiGradingProvider: 'jpdb', jpdbMiningEnabled: false }))).toBe('jiten');
        // Both off: the preference stands, and neither service takes the grade.
        expect(chosenWordGradingService(both({ apiGradingProvider: 'jpdb', jpdbMiningEnabled: false, jitenMiningEnabled: false }))).toBe('jpdb');

        const dualCard: JPDBCard = {
            vid: 1, sid: 2, rid: 3, spelling: '食べる', reading: 'たべる', frequencyRank: 100, partOfSpeech: ['v1'],
            meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb', jitenWordId: 42, jitenReadingIndex: 0,
        };
        const isJpdbBacked = (card: JPDBCard): boolean => card.vid > 0 && card.source === 'jpdb';
        expect(apiSrsProviderViewForCard(dualCard, both({ apiGradingProvider: 'jiten', jitenMiningEnabled: false }), isJpdbBacked)?.id).toBe('jpdb');
    });
});

describe('Settings → Reviews rows', () => {
    const facts = (overrides: Partial<ReviewServiceFacts> = {}): ReviewServiceFacts => ({
        credentials: { apiKey: '', jitenApiKey: '' },
        enabled: { yomuLocalSrsEnabled: true, jpdbMiningEnabled: true, jitenMiningEnabled: true },
        ankiAvailable: false,
        ...overrides,
    });

    it('shows each service connected only with its credential', () => {
        expect(reviewServiceState('yomu', facts())).toBe('on');
        expect(reviewServiceState('jpdb', facts())).toBe('off');
        expect(reviewServiceState('jpdb', facts({ credentials: { apiKey: 'jpdb', jitenApiKey: '' } }))).toBe('on');
        // A Jiten key pasted into the JPDB field is Jiten's.
        expect(reviewServiceState('jiten', facts({ credentials: { apiKey: 'ak_jiten', jitenApiKey: '' } }))).toBe('on');
        expect(reviewServiceState('bunpro', facts({ credentials: { apiKey: '', jitenApiKey: '', bunproFrontendApiToken: 't', bunproFrontendApiTokenExpiresAt: '2000-01-01T00:00:00.000Z' } }))).toBe('error');
    });

    it('marks Anki ready to connect only after Study\'s ping, and connected once it is on', () => {
        expect(reviewServiceState('anki', facts())).toBe('off');
        expect(reviewServiceState('anki', facts({ ankiAvailable: true }))).toBe('available');
        expect(reviewServiceState('anki', facts({ ankiAvailable: true, enabled: { ankiEnabled: true } }))).toBe('on');
    });

    it('offers a preferred grading service only with two services grading', () => {
        const jpdb = { apiKey: 'jpdb', jitenApiKey: '' };
        const both = { apiKey: 'jpdb', jitenApiKey: 'ak_jiten' };
        expect(showsPreferredGradingService(facts())).toBe(false);
        expect(showsPreferredGradingService(facts({ credentials: jpdb }))).toBe(false);
        expect(showsPreferredGradingService(facts({ credentials: both }))).toBe(true);
        expect(showsPreferredGradingService(facts({ credentials: both, enabled: { jpdbMiningEnabled: true, jitenMiningEnabled: false } }))).toBe(false);
    });
});
