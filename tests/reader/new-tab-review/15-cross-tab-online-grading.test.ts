import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    DEFAULT_SETTINGS,
    newTabPromptController,
    newTabTestCard,
    renderSeededNewTabWord,
    waitForExpect,
    type NewTabControllerOptions,
    type NewTabSettings,
} from './fixtures';
import type { JPDBCard } from './fixtures';

registerNewTabReviewCleanup();

type StudyTabInternals = {
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    gradeSubmissionInFlight: boolean;
    lastUndoableReview: unknown;
    sessionProgress: { snapshot(): { completedReviews: number } };
    loadWordsInto: (root: HTMLElement, preferStoredWord: boolean, options?: { useOfflineCache?: boolean }) => Promise<void>;
    bindRootEvents(root: HTMLElement): void;
};

interface ProviderCase {
    name: string;
    settings: Partial<NewTabSettings>;
    card: Partial<JPDBCard>;
    dependencies: (review: ReturnType<typeof vi.fn>) => Partial<NewTabControllerOptions>;
}

// One provider spy stands for the provider account both tabs grade into.
const PROVIDERS: ProviderCase[] = [
    {
        name: 'JPDB (five grades)',
        settings: { apiKey: 'jpdb-key', jpdbMiningEnabled: true },
        card: { source: 'jpdb', reviewSource: 'jpdb-api' },
        dependencies: review => ({ jpdb: { reviewCard: review } as never }),
    },
    {
        name: 'Jiten (four grades)',
        settings: { jitenApiKey: 'jiten-key', apiKey: '' },
        card: { source: 'jiten', reviewSource: 'jiten-api' },
        dependencies: review => ({ jiten: { reviewCard: review } as never }),
    },
    {
        name: 'Anki (four grades)',
        settings: { apiKey: '', ankiEnabled: true, newTabAnkiEnabled: true },
        card: { source: 'anki', reviewSource: 'anki', ankiCardId: 404, rid: 404 },
        dependencies: review => ({ anki: { answerCard: review } as never }),
    },
    {
        name: 'the local Yomu deck',
        settings: { yomuLocalSrsEnabled: true },
        card: { source: 'local', reviewSource: 'yomu-local' },
        dependencies: review => ({
            srsAdapters: { 'yomu-local': { label: 'Academy', hasCredential: () => true, queue: vi.fn(), stats: vi.fn(), review } as never },
        }),
    },
];

// Each tab gets its own host, as each browser tab has its own document.
function openStudyTab(provider: ProviderCase, card: JPDBCard, review: ReturnType<typeof vi.fn>) {
    const toast = vi.fn();
    const host = document.body.appendChild(document.createElement('div'));
    const controller = newTabPromptController({
        ...DEFAULT_SETTINGS,
        enableReviews: true,
        immersionKitEnabled: false,
        newTabParsingEnabled: false,
        newTabFrontSentenceEnabled: false,
        ...provider.settings,
    }, { ...provider.dependencies(review), toast }, { host });
    const root = host.appendChild(renderSeededNewTabWord(controller, card, {
        allWords: [card],
        reviewCountMode: true,
        state: { source: 'auto', revealAnswer: true },
    }));
    const internals = controller as unknown as StudyTabInternals;
    internals.bindRootEvents(root);
    const reload = vi.fn(async () => undefined);
    internals.loadWordsInto = reload;
    const grade = async () => {
        root.querySelector<HTMLButtonElement>('[data-newtab-action="grade"][data-grade="hard"]')!.click();
        await waitForExpect(() => expect(internals.gradeSubmissionInFlight).toBe(false));
    };
    return { controller, root, internals, toast, reload, grade };
}

describe('new tab review — two online Study tabs showing one card', () => {
    it.each(PROVIDERS)('reviews the card once for $name and retires the other tab\'s stale copy', async provider => {
        const card = newTabTestCard({ spelling: '二重', reading: 'にじゅう', cardState: ['due'], ...provider.card });
        const review = vi.fn().mockResolvedValue(undefined);
        const first = openStudyTab(provider, { ...card }, review);
        const second = openStudyTab(provider, { ...card }, review);
        try {
            await first.grade();
            expect(review).toHaveBeenCalledTimes(1);

            await second.grade();
            expect(review).toHaveBeenCalledTimes(1);
            expect(second.toast).toHaveBeenCalledWith('Already reviewed in another Study tab.');
            expect(second.internals.visibleWords).toEqual([]);
            expect(second.internals.allWords).toEqual([]);
            expect(second.reload).toHaveBeenCalledWith(second.root, false, { useOfflineCache: false });
            expect(second.internals.sessionProgress.snapshot().completedReviews).toBe(0);
            expect(second.internals.lastUndoableReview).toBeUndefined();
            expect(first.internals.sessionProgress.snapshot().completedReviews).toBe(1);
        } finally {
            first.controller.destroy();
            second.controller.destroy();
            document.body.replaceChildren();
        }
    });
});
