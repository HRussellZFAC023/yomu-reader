import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewTabController } from '../../src/reader/newtab/controller';
import {
    NEW_TAB_OFFLINE_WARM_CARD_TIMEOUT_MS,
    NEW_TAB_OFFLINE_WARM_LIMIT,
    NEW_TAB_OFFLINE_WARM_RETRY_MS,
} from '../../src/reader/newtab/controller-config';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard } from '../../src/reader/app/types';

type NewTabControllerOptions = ConstructorParameters<typeof NewTabController>[0];
type WarmInternals = {
    warmOfflineCache(cards: readonly JPDBCard[]): void;
    offlineCacheSegment(): string;
    offlineReadyKeys: Set<string>;
    offlineWarmSignature: string;
    offlineWarmTotal: number;
};

const DEFAULT_SETTINGS: typeof BASE_DEFAULT_SETTINGS = {
    ...BASE_DEFAULT_SETTINGS,
    interfaceLanguage: 'en',
};

function warmTestCard(index: number): JPDBCard {
    return {
        vid: 1000 + index,
        sid: 1,
        rid: 1,
        spelling: `語${index}`,
        reading: `ご${index}`,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['word'], partOfSpeech: [] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    } as unknown as JPDBCard;
}

function warmController(
    loadCardRenderData: NewTabControllerOptions['loadCardRenderData'],
    settings: typeof BASE_DEFAULT_SETTINGS = DEFAULT_SETTINGS,
): WarmInternals {
    const controller = new NewTabController({
        getSettings: () => settings,
        anki: {} as never,
        jpdb: {} as never,
        jpdbKanji: {} as never,
        kanjiVG: {} as never,
        rtk: {} as never,
        immersionKit: {} as never,
        jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        parser: { isJpdbBackedCard: () => true } as never,
        dictionaries: {} as never,
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
        loadCardRenderData,
    });
    return controller as unknown as WarmInternals;
}

describe('new tab offline warm cache', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('keeps warming the rest of the queue when one card load never settles', async () => {
        const cards = Array.from({ length: 5 }, (_, index) => warmTestCard(index));
        const load = vi.fn((card: JPDBCard, _options?: { includeBunproDefinition?: boolean }) => card.vid === cards[1].vid
            ? new Promise<never>(() => {})
            : Promise.resolve({} as never));
        const controller = warmController(load as never);

        controller.warmOfflineCache(cards);
        await vi.advanceTimersByTimeAsync(NEW_TAB_OFFLINE_WARM_CARD_TIMEOUT_MS + 1000);

        expect(load).toHaveBeenCalledTimes(5);
        expect(load.mock.calls.every(([, options]) => options?.includeBunproDefinition === false)).toBe(true);
        expect(controller.offlineReadyKeys.size).toBe(4);
    });

    it('continues past rejected loads and schedules a retry that re-arms the warm pass', async () => {
        const cards = Array.from({ length: 3 }, (_, index) => warmTestCard(index));
        const load = vi.fn((card: JPDBCard) => card.vid === cards[0].vid
            ? Promise.reject(new Error('provider down'))
            : Promise.resolve({} as never));
        const controller = warmController(load as never);

        controller.warmOfflineCache(cards);
        await vi.advanceTimersByTimeAsync(1000);
        expect(controller.offlineReadyKeys.size).toBe(2);
        expect(controller.offlineWarmSignature).not.toBe('');

        await vi.advanceTimersByTimeAsync(NEW_TAB_OFFLINE_WARM_RETRY_MS + 1000);
        expect(controller.offlineWarmSignature).toBe('');
    });

    it('warms up to the configured offline limit when it exceeds the base warm cap', async () => {
        const settings = { ...DEFAULT_SETTINGS, newTabOfflineEnabled: true, newTabOfflineLimit: 120 };
        const cards = Array.from({ length: 150 }, (_, index) => warmTestCard(index));
        const load = vi.fn(() => Promise.resolve({} as never));
        const controller = warmController(load as never, settings);

        controller.warmOfflineCache(cards);
        await vi.advanceTimersByTimeAsync(30_000);

        expect(controller.offlineWarmTotal).toBe(120);
        expect(controller.offlineWarmTotal).toBeGreaterThan(NEW_TAB_OFFLINE_WARM_LIMIT);
        expect(controller.offlineReadyKeys.size).toBe(120);
    });

    it('reports warm progress as cached N/M and collapses to cached N when done', async () => {
        const cards = Array.from({ length: 4 }, (_, index) => warmTestCard(index));
        let releaseLoads: (() => void) | undefined;
        const gate = new Promise<void>(resolve => { releaseLoads = resolve; });
        const load = vi.fn((card: JPDBCard) => card.vid === cards[0].vid
            ? Promise.resolve({} as never)
            : gate.then(() => ({} as never)));
        const controller = warmController(load as never);

        controller.warmOfflineCache(cards);
        await vi.advanceTimersByTimeAsync(1000);
        expect(controller.offlineCacheSegment()).toBe('Cached 1/4');

        releaseLoads?.();
        await vi.advanceTimersByTimeAsync(1000);
        expect(controller.offlineCacheSegment()).toBe('Cached 4');
    });
});
