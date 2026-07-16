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

function controllerWithAdapters(
    settings: Partial<ReaderSettings>,
    adapters: Partial<Record<'bunpro' | 'yomu-local', Partial<YomuSrsAdapter>>>,
    jpdbReview = vi.fn(),
    options: { surface?: 'standalone' | 'academy' } = {},
) {
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
            'yomu-local': { label: 'Academy', hasCredential: () => true, stats: vi.fn(), queue: vi.fn(), review: vi.fn(), ...adapters['yomu-local'] } as never,
        },
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
        dismissLookup: vi.fn(),
        toast: vi.fn(),
    } as never, options);
}

describe('new-tab queued SRS grades', () => {
    it('refuses legacy Bunpro queued grades while preserving Yomu local grades', async () => {
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
            await expect(internals.submitQueuedGrade({ target: 'bunpro-api', card: srsCard({ source: 'bunpro', reviewSource: 'bunpro-api', bunproReviewId: '10' }), grade: 'pass' })).resolves.toBe(false);
            await expect(internals.submitQueuedGrade({ target: 'yomu-local', card: srsCard({ source: 'yomu-local', reviewSource: 'yomu-local', sourceCardKey: 'local:読む' }), grade: 'pass' })).resolves.toBe(true);

            expect(bunproReview).not.toHaveBeenCalled();
            expect(yomuReview).toHaveBeenCalledTimes(1);
            expect(jpdbReview).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });
});

describe('Academy Reader Study queue selection', () => {
    const queuedCard = {
        providerId: 'yomu-local' as const,
        providerCardId: 'academy-card',
        providerReviewId: 'academy-card',
        kind: 'vocabulary' as const,
        expression: '読む',
        reading: 'よむ',
        meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
        sentence: '本を読む。',
        state: ['due' as const],
        dueAt: 1_000,
        raw: { academyProvenance: { syllabus: { sourceId: 'academy:lesson-01' } } },
    };

    it('uses the real Yomu queue on Academy even when the standalone preference is disabled', async () => {
        const review = vi.fn(async () => ({}));
        const jpdbReview = vi.fn(async () => undefined);
        const queue = vi.fn(async () => ({
            providerId: 'yomu-local' as const,
            fetchedAt: 1_000,
            cards: [queuedCard],
            dueCount: 0,
            newCount: 1,
            reviewCount: 1,
        }));
        const controller = controllerWithAdapters({
            newTabSource: 'jpdb',
            yomuLocalSrsEnabled: false,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
        }, {
            'yomu-local': { queue, review },
        }, jpdbReview, { surface: 'academy' });
        const internals = controller as unknown as {
            state: { source: string };
            loadSrsAdapterWords(source: 'yomu-local'): Promise<{ cards: JPDBCard[] }>;
            reviewTargetsForCard(card: JPDBCard): string[];
            submitGrade(card: JPDBCard, grade: 'pass'): Promise<unknown>;
        };

        try {
            expect(internals.state.source).toBe('yomu-local');
            const loaded = await internals.loadSrsAdapterWords('yomu-local');
            expect(queue).toHaveBeenCalled();
            expect(loaded.cards[0]).toMatchObject({
                spelling: '読む',
                sentence: '本を読む。',
                source: 'yomu-local',
                reviewSource: 'yomu-local',
            });
            expect(internals.reviewTargetsForCard(loaded.cards[0]!)).toEqual(['yomu-local']);

            await internals.submitGrade(loaded.cards[0]!, 'pass');
            expect(review).toHaveBeenCalledTimes(1);
            expect(jpdbReview).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('preserves the configured standalone workflow when Yomu local Study is disabled', async () => {
        const queue = vi.fn();
        const controller = controllerWithAdapters({ newTabSource: 'jpdb', yomuLocalSrsEnabled: false }, {
            'yomu-local': { queue },
        });
        const internals = controller as unknown as {
            state: { source: string };
            loadSrsAdapterWords(source: 'yomu-local'): Promise<{ cards: JPDBCard[] }>;
        };

        try {
            expect(internals.state.source).toBe('jpdb');
            expect((await internals.loadSrsAdapterWords('yomu-local')).cards).toEqual([]);
            expect(queue).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('does not offer starter practice when the real Academy queue is empty', () => {
        const controller = controllerWithAdapters({}, {
            'yomu-local': { queue: vi.fn() },
        }, vi.fn(), { surface: 'academy' });
        const internals = controller as unknown as {
            renderEnabledContent(): DocumentFragment;
            renderEmpty(root: HTMLElement, prompt: string, message: string): void;
        };
        const root = document.createElement('main');
        root.append(internals.renderEnabledContent());

        try {
            internals.renderEmpty(root, 'Yomu', 'No review cards ready.');
            const controls = root.querySelector<HTMLElement>('[data-newtab-controls]');
            expect(root.querySelector('[data-newtab-answer]')?.textContent).toBe('No review cards ready.');
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(controls?.hidden).toBe(true);
            expect(controls?.textContent).toBe('');
            expect(root.textContent).not.toContain('Starter words');
        } finally {
            controller.destroy();
        }
    });
});
