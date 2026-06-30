import { describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { YomuSrsAdapter } from '../../src/reader/srs/types';

function srsCard(overrides: Partial<JPDBCard>): JPDBCard {
    return {
        vid: -1,
        sid: -2,
        rid: -3,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

function controllerWithAdapters(settings: Partial<ReaderSettings>, adapters: Partial<Record<'bunpro' | 'yomu-local', Partial<YomuSrsAdapter>>>, jpdbReview = vi.fn()) {
    return new NewTabController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            enableReviews: true,
            bunproMiningEnabled: true,
            yomuLocalSrsEnabled: true,
            ...settings,
        }),
        anki: {} as never,
        jpdb: { reviewCard: jpdbReview } as never,
        jiten: {} as never,
        jpdbKanji: { lookup: vi.fn(async () => null) } as never,
        kanjiVG: {} as never,
        rtk: {} as never,
        immersionKit: {} as never,
        jpdbReviewBridge: {
            onUpdate: () => () => {},
            latestStatus: () => ({ connected: false }),
            reveal: vi.fn(),
            grade: vi.fn(),
            requestCurrent: vi.fn(),
        } as never,
        parser: {} as never,
        dictionaries: {} as never,
        srsAdapters: {
            bunpro: { label: 'Bunpro', hasCredential: () => true, stats: vi.fn(), queue: vi.fn(), review: vi.fn(), ...adapters.bunpro } as never,
            'yomu-local': { label: 'Yomu', hasCredential: () => true, stats: vi.fn(), queue: vi.fn(), review: vi.fn(), ...adapters['yomu-local'] } as never,
        },
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
        dismissLookup: vi.fn(),
        toast: vi.fn(),
    } as never);
}

describe('new-tab queued SRS grades', () => {
    it('flushes Bunpro and Yomu local queued grades through SRS adapters, not JPDB', async () => {
        const bunproReview = vi.fn(async () => ({}));
        const yomuReview = vi.fn(async () => ({}));
        const jpdbReview = vi.fn(async () => undefined);
        const controller = controllerWithAdapters({}, {
            bunpro: { review: bunproReview },
            'yomu-local': { review: yomuReview },
        }, jpdbReview);
        const internals = controller as unknown as {
            submitQueuedGrade(item: { target: 'bunpro-api' | 'yomu-local'; card: JPDBCard; grade: 'pass' }): Promise<boolean>;
            destroy(): void;
        };

        try {
            await internals.submitQueuedGrade({ target: 'bunpro-api', card: srsCard({ source: 'bunpro', reviewSource: 'bunpro-api', bunproReviewId: '10' }), grade: 'pass' });
            await internals.submitQueuedGrade({ target: 'yomu-local', card: srsCard({ source: 'yomu-local', reviewSource: 'yomu-local', sourceCardKey: 'local:読む' }), grade: 'pass' });

            expect(bunproReview).toHaveBeenCalledTimes(1);
            expect(yomuReview).toHaveBeenCalledTimes(1);
            expect(jpdbReview).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });
});
