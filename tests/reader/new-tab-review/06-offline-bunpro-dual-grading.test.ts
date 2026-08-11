// fallow-ignore-file code-duplication
import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    WORD_ONLY_STUDY_DISABLED_STEPS,
    DEFAULT_SETTINGS,
    NEW_TAB_GRADE_QUEUE_KEY,
    newTabTestCard,
    deferred,
    readNewTabGradeQueue,
    newTabPromptController,
    renderEnabledNewTabRoot,
    newTabBareController,
    queueNewTabGrades,
    newTabFlushController,
    renderSeededNewTabWord,
    renderJpdbAnkiReviewWordFixture,
    resetNewTabReviewStorage,
    newTabStatusButton,
    newTabPromptText,
    showNextNewTabWord,
    newTabSourceSelect,
    expectNewTabStatusSources,
    newTabVisibleWordFixture,
    cardKey,
    NewTabController,
    waitForExpect,
} from './fixtures';
import type {
    JPDBCard,
    JPDBGrade,
} from './fixtures';
import { newTabReviewProviderContext } from '../../../src/reader/newtab/provider-context-policy';

describe('new tab review — offline grades, Bunpro & dual-source grading', () => {
    registerNewTabReviewCleanup();


    it('queues offline JPDB grades without returning navigation to the graded card', async () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const second = newTabTestCard({ vid: 2, sid: 2, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
                newTabOfflineEnabled: true,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
                newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
            }), {
            jpdb: { reviewCard } as never,
        });
        const root = renderSeededNewTabWord(controller, first, {
            allWords: [first, second],
            visibleWords: [first, second],
            reviewCountMode: true,
            sourceLabel: 'JPDB (offline)',
            state: { source: 'jpdb', revealAnswer: true },
            appendToDocument: true,
            bindRootEvents: true,
        });

        await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

        const queue = readNewTabGradeQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ target: 'jpdb-api', grade: 'okay', attempts: 0 });
        expect(queue[0]?.card.spelling).toBe('安定');
        expect(reviewCard).not.toHaveBeenCalled();
        expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む']);
        expect(newTabPromptText(root)).toContain('読む');
        root.querySelector<HTMLButtonElement>('[data-newtab-action="previous"]')?.click();
        expect(newTabPromptText(root)).toContain('読む');
        root.remove();
    });

    it('flushes queued JPDB grades when the source is reachable again', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        queueNewTabGrades({
            id: 'jpdb-api:1:1:安定:あんてい',
            target: 'jpdb-api',
            card,
            grade: 'easy',
        });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard } as never,
        });
        scopeQueuedNetworkGradesTo(controller);

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(reviewCard).toHaveBeenCalledWith(card, 'easy');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('flushes queued Jiten grades through the Jiten API provider', async () => {
        const card = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        queueNewTabGrades({
            id: 'jiten-api:42:2:日本語:にほんご',
            target: 'jiten-api',
            card,
            grade: 'easy',
        });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
        }, {
            anki: { answerCard: vi.fn() } as never,
            jpdb: { reviewCard: vi.fn() } as never,
            jiten: { listStudyBatchCards: vi.fn(), reviewCard } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        });
        scopeQueuedNetworkGradesTo(controller);

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(reviewCard).toHaveBeenCalledWith(card, 'easy');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('submits queued locked JPDB grades', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '未解禁', reading: 'みかいきん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['locked'] });
        queueNewTabGrades({
            id: 'jpdb-api:1:1:未解禁:みかいきん',
            target: 'jpdb-api',
            card,
            grade: 'easy',
        });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard } as never,
        });
        scopeQueuedNetworkGradesTo(controller);

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(reviewCard).toHaveBeenCalledWith(card, 'easy');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('keeps queued JPDB grades when sync fails so they can retry later', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        queueNewTabGrades({
            id: 'jpdb-api:1:1:安定:あんてい',
            target: 'jpdb-api',
            card,
            grade: 'hard',
        });
        const reviewCard = vi.fn(async () => { throw new Error('offline'); });
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard } as never,
        });
        scopeQueuedNetworkGradesTo(controller);

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        const queue = readNewTabGradeQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ target: 'jpdb-api', grade: 'hard', attempts: 1, lastError: 'offline' });
    });

    it('does not let a failed Anki sync block a reachable JPDB queued grade', async () => {
        const ankiCard = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        queueNewTabGrades(
            { id: 'anki:404', target: 'anki', card: ankiCard, grade: 'fail' },
            { id: 'jpdb-api:1:1:安定:あんてい', target: 'jpdb-api', card: jpdbCard, grade: 'easy' },
        );
        const answerCard = vi.fn(async () => { throw new Error('anki offline'); });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, ankiEnabled: true }), {
            anki: { answerCard } as never,
            jpdb: { reviewCard } as never,
        });
        scopeQueuedNetworkGradesTo(controller);

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(answerCard).toHaveBeenCalledWith(404, 'fail');
        expect(reviewCard).toHaveBeenCalledWith(jpdbCard, 'easy');
        const queue = readNewTabGradeQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ target: 'anki', grade: 'fail', attempts: 1, lastError: 'anki offline' });
    });

    it('flushes queued Anki grades through AnkiConnect', async () => {
        const card = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        queueNewTabGrades({
            id: 'anki:404',
            target: 'anki',
            card,
            grade: 'pass',
        });
        const answerCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }), {
            anki: { answerCard } as never,
        });
        scopeQueuedNetworkGradesTo(controller);

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('invalidates cached Anki queues after queued Anki grades flush', async () => {
        const stale = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const fresh = newTabTestCard({ spelling: '次回', reading: 'じかい', source: 'anki', reviewSource: 'anki', ankiCardId: 405 });
        queueNewTabGrades({
            id: 'anki:404',
            target: 'anki',
            card: stale,
            grade: 'pass',
        });
        const listNewTabCards = vi.fn(async (): Promise<JPDBCard[]> => [stale]);
        listNewTabCards.mockResolvedValueOnce([stale]).mockResolvedValueOnce([fresh]);
        const answerCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true }), {
            anki: { answerCard, listNewTabCards } as never,
        });
        scopeQueuedNetworkGradesTo(controller);
        const internals = controller as unknown as {
            loadWordsFromSource(source: 'anki'): Promise<{ cards: JPDBCard[] }>;
            flushQueuedGrades(): Promise<void>;
        };

        await expect(internals.loadWordsFromSource('anki')).resolves.toMatchObject({
            cards: [expect.objectContaining({ spelling: '復習' })],
        });
        await internals.flushQueuedGrades();
        await expect(internals.loadWordsFromSource('anki')).resolves.toMatchObject({
            cards: [expect.objectContaining({ spelling: '次回' })],
        });

        expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        expect(listNewTabCards).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('retries queued grades when the browser comes back online', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        queueNewTabGrades({
            id: 'jpdb-api:1:1:安定:あんてい',
            target: 'jpdb-api',
            card,
            grade: 'okay',
        });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard } as never,
        });
        scopeQueuedNetworkGradesTo(controller);
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        window.dispatchEvent(new Event('online'));

        await waitForExpect(() => {
            expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
        });
        controller.destroy();
        root.remove();
    });

    it('asks before queueing offline when the connection is lost, and continues offline', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const { controller, root } = newTabVisibleWordFixture(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }), {
            card,
            sourceLabel: 'JPDB',
            source: 'jpdb',
        });
        const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
        try {
            const pending = (controller as unknown as { gradeCurrentCard(grade: JPDBGrade): Promise<boolean> }).gradeCurrentCard('okay');
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-reader-connection-lost')).toBeTruthy();
            });
            document.querySelector<HTMLButtonElement>('[data-connection-lost-action="continue"]')?.click();
            await expect(pending).resolves.toBe(true);
            expect(document.querySelector('.jpdb-reader-connection-lost')).toBeNull();
            const queue = readNewTabGradeQueue();
            expect(queue).toHaveLength(1);
            expect(queue[0]).toMatchObject({ target: 'jpdb-api', grade: 'okay' });
        } finally {
            onLine.mockRestore();
            controller.destroy();
            root.remove();
        }
    });

    it('never raises the connection-lost dialog for local Academy (yomu-local) grades while offline', async () => {
        const card = newTabTestCard({ vid: 4, sid: 1, spelling: '学園', reading: 'がくえん', source: 'local', reviewSource: 'yomu-local' });
        const { controller, root } = newTabVisibleWordFixture(() => ({ ...DEFAULT_SETTINGS, yomuLocalSrsEnabled: true, immersionKitEnabled: false }), {
            card,
            sourceLabel: 'Academy',
            source: 'yomu-local',
        });
        const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
        try {
            const graded = await (controller as unknown as { gradeCurrentCard(grade: JPDBGrade): Promise<boolean> }).gradeCurrentCard('okay');
            // Local grading needs no connection: no dialog, grade queued silently.
            expect(document.querySelector('.jpdb-reader-connection-lost')).toBeNull();
            expect(graded).toBe(true);
            const queue = readNewTabGradeQueue();
            expect(queue).toHaveLength(1);
            expect(queue[0]).toMatchObject({ target: 'yomu-local', grade: 'okay' });
        } finally {
            onLine.mockRestore();
            controller.destroy();
            root.remove();
        }
    });

    it('stop reviewing leaves the connection-lost grade unqueued and unsubmitted', async () => {
        const card = newTabTestCard({ vid: 2, sid: 1, spelling: '休止', reading: 'きゅうし', source: 'jpdb', reviewSource: 'jpdb-api' });
        const { controller, root } = newTabVisibleWordFixture(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }), {
            card,
            sourceLabel: 'JPDB',
            source: 'jpdb',
        });
        const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
        try {
            const pending = (controller as unknown as { gradeCurrentCard(grade: JPDBGrade): Promise<boolean> }).gradeCurrentCard('okay');
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-reader-connection-lost')).toBeTruthy();
            });
            document.querySelector<HTMLButtonElement>('[data-connection-lost-action="stop"]')?.click();
            await expect(pending).resolves.toBe(false);
            expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
        } finally {
            onLine.mockRestore();
            controller.destroy();
            root.remove();
        }
    });

    it('retry re-attempts the grade and re-prompts while still offline', async () => {
        const card = newTabTestCard({ vid: 3, sid: 1, spelling: '再試', reading: 'さいし', source: 'jpdb', reviewSource: 'jpdb-api' });
        const { controller, root } = newTabVisibleWordFixture(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }), {
            card,
            sourceLabel: 'JPDB',
            source: 'jpdb',
        });
        const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
        try {
            const pending = (controller as unknown as { gradeCurrentCard(grade: JPDBGrade): Promise<boolean> }).gradeCurrentCard('okay');
            await waitForExpect(() => {
                expect(document.querySelector('[data-connection-lost-action="retry"]')).toBeTruthy();
            });
            document.querySelector<HTMLButtonElement>('[data-connection-lost-action="retry"]')?.click();
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-reader-connection-lost')).toBeTruthy();
            });
            document.querySelector<HTMLButtonElement>('[data-connection-lost-action="stop"]')?.click();
            await expect(pending).resolves.toBe(false);
            expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
        } finally {
            onLine.mockRestore();
            controller.destroy();
            root.remove();
        }
    });

    it('clears the accepted offline choice when the browser comes back online', async () => {
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard: vi.fn(async () => {}) } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const internals = controller as unknown as { bindRootEvents(root: HTMLElement): void; offlineReviewingAccepted: boolean };
        internals.bindRootEvents(root);
        internals.offlineReviewingAccepted = true;

        window.dispatchEvent(new Event('online'));

        await waitForExpect(() => {
            expect(internals.offlineReviewingAccepted).toBe(false);
        });
        controller.destroy();
        root.remove();
    });

    it('hides grade buttons for offline live JPDB review cards that cannot be replayed', () => {
        const card = newTabTestCard({ vid: 0, sid: 0, rid: 0, spelling: '記', reading: 'record', source: 'jpdb', reviewSource: 'jpdb-live', jpdbReviewId: 'kb,記' });
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabParsingEnabled: false,
            newTabFrontSentenceEnabled: false,
        }), {
            card,
            index: 0,
            sourceLabel: 'JPDB (offline)',
            source: 'jpdb',
            revealAnswer: true,
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-grade]')).toBeNull();
        expect(root.querySelector('[data-newtab-action="reveal"]')).not.toBeNull();
    });

    it('does not reload a just-graded live JPDB card from a stale bridge status', async () => {
        const card = newTabTestCard({
            vid: 0,
            sid: 0,
            rid: 0,
            spelling: '記',
            reading: '記',
            source: 'jpdb',
            reviewSource: 'jpdb-live',
            jpdbReviewId: 'kb,記',
            kanjiKeyword: 'record',
        });
        const liveStatus = {
            connected: true,
            loginRequired: false,
            message: '',
            card: {
                id: 'kb,記',
                kind: 'kanji' as const,
                phase: 'back' as const,
                prompt: 'record',
                answer: '記',
                spelling: '',
                reading: '',
                sentence: '',
                kanji: '記',
                keyword: 'record',
                itemsLeft: 1,
                href: 'https://jpdb.io/review?c=kb,%E8%A8%98&r=1',
            },
        };
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            jpdbMiningEnabled: true,
            enableReviews: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'live-review',
            immersionKitEnabled: false,
            newTabParsingEnabled: false,
            newTabFrontSentenceEnabled: false,
        }), {
            card,
            allWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB Live review',
            source: 'jpdb',
            revealAnswer: true,
            controllerOverrides: {
                jpdbReviewBridge: {
                    onUpdate: () => () => {},
                    latestStatus: () => liveStatus,
                    requestCurrent: vi.fn(),
                    grade: vi.fn(),
                } as never,
            },
        });
        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            await waitForExpect(() => {
                expect((controller as unknown as { allWords: JPDBCard[] }).allWords.map(item => item.jpdbReviewId)).not.toContain('kb,記');
            });
        } finally {
            root.remove();
        }
    });

    it('reviews Anki new-tab cards when Anki is enabled', async () => {
        const card = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const answerCard = vi.fn(async () => {});
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabParsingEnabled: false,
            newTabFrontSentenceEnabled: false,
        }), {
            card,
            index: 0,
            sourceLabel: 'Anki',
            source: 'anki',
            revealAnswer: true,
            controllerOverrides: {
                anki: { answerCard } as never,
            },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelectorAll('[data-grade]').length).toBeGreaterThan(0);
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Anki #404');
            expect(root.querySelector('[data-newtab-grade-target]')?.getAttribute('aria-label')).toBe('Grades Anki card: Anki #404');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();

            await (controller as unknown as { gradeCurrentCard(grade: 'pass'): Promise<void> }).gradeCurrentCard('pass');

            expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        } finally {
            root.remove();
        }
    });

    it('never restores a consumed Bunpro review through local undo or browser-back state', async () => {
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '7701',
            bunproReviewableId: 8801,
            bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '44',
            bunproReviewInputMode: 'regular',
            bunproReviewEndpoint: 'review',
            cardState: ['due'],
        });
        const review = vi.fn(async () => ({}));
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        }), {
            card,
            allWords: [card],
            reviewCountMode: true,
            sourceLabel: 'Bunpro',
            source: 'bunpro',
            controllerOverrides: {
                srsAdapters: { bunpro: { hasCredential: () => true, review } as never },
            },
        });
        const reload = vi.fn(async () => undefined);
        const internals = controller as unknown as {
            gradeCurrentCard(grade: 'pass'): Promise<boolean>;
            undoLastReview(root: HTMLElement): Promise<void>;
            canUndoLastReview(): boolean;
            lastUndoableReview?: { card: JPDBCard };
            loadWordsInto: typeof reload;
            allWords: JPDBCard[];
        };
        internals.loadWordsInto = reload;

        try {
            expect((controller as unknown as { reviewTargetsForCard(card: JPDBCard): string[] }).reviewTargetsForCard(card)).toEqual(['bunpro-api']);
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(true);
            expect(review).toHaveBeenCalledOnce();
            expect(internals.lastUndoableReview).toBeUndefined();
            expect(internals.canUndoLastReview()).toBe(false);

            await internals.undoLastReview(root);
            window.dispatchEvent(new PopStateEvent('popstate'));
            await Promise.resolve();

            expect(review).toHaveBeenCalledOnce();
            expect(internals.allWords).not.toContain(card);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('never restores or re-caches a consumed WaniKani due assignment', async () => {
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'wanikani',
            reviewSource: 'wanikani-api',
            wanikaniAssignmentId: 7701,
            wanikaniSubjectId: 8801,
            wanikaniSubjectType: 'vocabulary',
            wanikaniSrsStage: 'apprentice',
            cardState: ['due'],
        });
        const review = vi.fn(async ({ card: reviewable }: { card: { state: JPDBCard['cardState'] } }) => ({
            card: { ...reviewable, state: ['learning'] as JPDBCard['cardState'] },
        }));
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            wanikaniApiToken: 'wanikani-token',
            wanikaniReviewEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        }), {
            card,
            allWords: [card],
            reviewCountMode: true,
            sourceLabel: 'WaniKani',
            source: 'wanikani',
            controllerOverrides: {
                srsAdapters: { wanikani: { hasCredential: () => true, review } as never },
            },
        });
        const reload = vi.fn(async () => undefined);
        const internals = controller as unknown as {
            gradeCurrentCard(grade: 'pass'): Promise<boolean>;
            undoLastReview(root: HTMLElement): Promise<void>;
            canUndoLastReview(): boolean;
            lastUndoableReview?: { card: JPDBCard };
            loadWordsInto: typeof reload;
            allWords: JPDBCard[];
            sourceResultCache: Map<string, unknown>;
        };
        internals.loadWordsInto = reload;
        internals.sourceResultCache.set('wanikani', { signature: 'stale', result: { cards: [card] } });

        try {
            expect((controller as unknown as { reviewTargetsForCard(card: JPDBCard): string[] }).reviewTargetsForCard(card)).toEqual(['wanikani-api']);
            const gradeControls = (controller as unknown as { gradeControlButtons(card: JPDBCard): HTMLElement[] }).gradeControlButtons(card);
            expect(gradeControls[0]).toMatchObject({ dataset: { wanikaniGradeMappingHelp: 'true' } });
            expect(gradeControls[0]?.textContent).toContain('Anything below Okay submits one incorrect meaning answer');
            expect(gradeControls[1]).toMatchObject({ dataset: { grade: 'nothing' } });
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(true);
            expect(review).toHaveBeenCalledOnce();
            expect(internals.lastUndoableReview).toBeUndefined();
            expect(internals.canUndoLastReview()).toBe(false);
            expect(internals.sourceResultCache.has('wanikani')).toBe(false);

            await internals.undoLastReview(root);
            window.dispatchEvent(new PopStateEvent('popstate'));
            await Promise.resolve();

            expect(review).toHaveBeenCalledOnce();
            expect(internals.allWords).not.toContain(card);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('retires an ambiguously submitted Bunpro review and reloads before it can be graded twice', async () => {
        const card = newTabTestCard({
            spelling: '文法',
            reading: 'ぶんぽう',
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '99001',
            bunproReviewableId: 9901,
            bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '45',
            bunproReviewInputMode: 'regular',
            bunproReviewEndpoint: 'review',
            cardState: ['due'],
        });
        const response = deferred<boolean>();
        const review = vi.fn(async () => {
            await response.promise;
            throw new Error('response lost after submit');
        });
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        }), {
            card,
            allWords: [card],
            reviewCountMode: true,
            sourceLabel: 'Bunpro',
            source: 'bunpro',
            controllerOverrides: {
                srsAdapters: { bunpro: { hasCredential: () => true, review } as never },
            },
        });
        const reload = vi.fn(async () => undefined);
        const internals = controller as unknown as {
            gradeCurrentCard(grade: 'pass'): Promise<boolean>;
            loadWordsInto: typeof reload;
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
        };
        internals.loadWordsInto = reload;

        try {
            expect((controller as unknown as { reviewTargetsForCard(card: JPDBCard): string[] }).reviewTargetsForCard(card)).toEqual(['bunpro-api']);
            const firstGrade = internals.gradeCurrentCard('pass');
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(false);
            expect(review).toHaveBeenCalledOnce();
            response.resolve(true);
            await expect(firstGrade).resolves.toBe(true);
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(false);

            expect(review).toHaveBeenCalledOnce();
            expect(reload).toHaveBeenCalledOnce();
            expect(internals.allWords).toEqual([]);
            expect(internals.visibleWords).toEqual([]);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('retires a Bunpro obligation from another Study tab before accepting more input', async () => {
        document.body.replaceChildren();
        const card = newTabTestCard({
            spelling: '同期',
            reading: 'どうき',
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '99002',
            bunproReviewableId: 9902,
            bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '46',
            bunproReviewInputMode: 'regular',
            bunproReviewEndpoint: 'review',
            cardState: ['due'],
        });
        const review = vi.fn(async () => ({}));
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        }), {
            card,
            allWords: [card],
            reviewCountMode: true,
            sourceLabel: 'Bunpro',
            source: 'bunpro',
            controllerOverrides: {
                srsAdapters: { bunpro: { hasCredential: () => true, review } as never },
            },
        });
        const reloadGate = deferred<boolean>();
        const reload = vi.fn(async () => { await reloadGate.promise; });
        const internals = controller as unknown as {
            refreshBunproQueueAfterExternalGrade(): Promise<void>;
            gradeCurrentCard(grade: 'pass'): Promise<boolean>;
            loadWordsInto: typeof reload;
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            setStudyStepOverrideForCurrentCard(id: string): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        internals.loadWordsInto = reload;
        internals.setStudyStepOverrideForCurrentCard('final-reveal');
        internals.renderWord(root, card);

        try {
            const refresh = internals.refreshBunproQueueAfterExternalGrade();
            expect(root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"]:disabled').length).toBeGreaterThan(0);
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(false);
            expect(review).not.toHaveBeenCalled();
            expect(internals.allWords).toEqual([]);
            expect(internals.visibleWords).toEqual([]);

            reloadGate.resolve(true);
            await refresh;
            expect(reload).toHaveBeenCalledOnce();
            expect(review).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('refuses stale Bunpro lookup and doodle callbacks after the queue changes cards', async () => {
        const previous = newTabTestCard({
            spelling: '同じ', reading: 'おなじ', source: 'bunpro', reviewSource: 'bunpro-api',
            bunproReviewId: '1001', bunproReviewableId: 2001, bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '47', bunproReviewInputMode: 'regular', bunproReviewEndpoint: 'review', cardState: ['due'],
        });
        const current = newTabTestCard({
            ...previous,
            bunproReviewId: '1002',
            bunproReviewableId: 2002,
            bunproReviewSessionId: '48',
        });
        const settings = {
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            enableReviews: true,
            newTabKanjiAutoSubmit: true,
            immersionKitEnabled: false,
        };
        const review = vi.fn(async () => ({}));
        const { controller, root } = newTabVisibleWordFixture(settings, {
            card: current,
            allWords: [current],
            reviewCountMode: true,
            sourceLabel: 'Bunpro',
            source: 'bunpro',
            controllerOverrides: { srsAdapters: { bunpro: { hasCredential: () => true, review } as never } },
        });

        try {
            await expect(controller.gradeFromLookup('pass', { kind: 'bunpro' }, previous))
                .resolves.toEqual({ preserveLookup: false });
            (controller as unknown as {
                autoSubmitDoodleAssessment(settings: typeof DEFAULT_SETTINGS, passed: boolean, expectedCard: JPDBCard): void;
            }).autoSubmitDoodleAssessment(settings, true, previous);
            await Promise.resolve();

            expect(review).not.toHaveBeenCalled();
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords).toEqual([current]);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('supersedes an initial Bunpro load when an external grade arrives before cards render', async () => {
        document.body.replaceChildren();
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproMiningEnabled: true,
        }), {
            srsAdapters: { bunpro: { hasCredential: () => true } as never },
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const reload = vi.fn(async () => undefined);
        const internals = controller as unknown as {
            state: { source: string; revealAnswer: boolean };
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            loadWordsInto: typeof reload;
            refreshBunproQueueAfterExternalGrade(): Promise<void>;
        };
        Object.assign(internals, {
            state: { ...((controller as unknown as { state: object }).state), source: 'bunpro', revealAnswer: false },
            allWords: [],
            visibleWords: [],
            loadWordsInto: reload,
        });

        try {
            await internals.refreshBunproQueueAfterExternalGrade();
            expect(reload).toHaveBeenCalledWith(root, true, { useOfflineCache: false });
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('maps doodle auto-submit to Bunpro regular and FSRS outcomes', () => {
        const controller = newTabBareController();
        const gradeCurrentCard = vi.fn(async (_grade: JPDBGrade, _target?: unknown, _card?: JPDBCard) => true);
        const internals = controller as unknown as {
            state: { revealAnswer: boolean };
            gradeCurrentCard: typeof gradeCurrentCard;
            autoSubmitDoodleAssessment(settings: typeof DEFAULT_SETTINGS, passed: boolean, expectedCard: JPDBCard): void;
        };
        internals.state = { ...internals.state, revealAnswer: true };
        internals.gradeCurrentCard = gradeCurrentCard;
        const regular = newTabTestCard({ source: 'bunpro', reviewSource: 'bunpro-api', bunproReviewInputMode: 'regular' });
        const fsrs = newTabTestCard({ source: 'bunpro', reviewSource: 'bunpro-api', bunproReviewInputMode: 'fsrs' });
        const settings = { ...DEFAULT_SETTINGS, enableReviews: true, newTabKanjiAutoSubmit: true };

        internals.autoSubmitDoodleAssessment(settings, true, regular);
        internals.autoSubmitDoodleAssessment(settings, false, regular);
        internals.autoSubmitDoodleAssessment(settings, true, fsrs);
        internals.autoSubmitDoodleAssessment(settings, false, fsrs);

        expect(gradeCurrentCard.mock.calls.map(([grade]) => grade)).toEqual(['pass', 'fail', 'okay', 'nothing']);
    });

    it('merges matching JPDB and Anki auto review cards into one dual-source prompt', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const jpdbCard = newTabTestCard({
            vid: 250,
            sid: 1,
            rid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
        });
        const ankiCard = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiNoteId: 1404,
            ankiDeckNames: ['Core'],
            rid: 404,
        });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
                enableReviews: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }) } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as {
            loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
            loadAnkiWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
        }, {
            async loadJpdbWords() {
                return { cards: [jpdbCard], sourceLabel: 'JPDB', reviewCountMode: true };
            },
            async loadAnkiWords() {
                return { cards: [ankiCard], sourceLabel: 'Anki', reviewCountMode: true };
            },
        });

        await controller.renderPage();

        const words = (controller as unknown as { allWords: JPDBCard[] }).allWords;
        expect(words).toHaveLength(1);
        expect(words[0]).toMatchObject({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiNoteId: 1404,
            ankiDeckNames: ['Core'],
        });
        expectNewTabStatusSources(['jpdb', 'anki']);
        resetNewTabReviewStorage();
    });

    it('merges live JPDB review cards with matching Anki cards so grading hits both backends', async () => {
        resetNewTabReviewStorage();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const jpdbCard = newTabTestCard({
            vid: 0,
            sid: 0,
            rid: 0,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-live',
            jpdbReviewId: 'live-vocab-1',
        });
        const ankiCard = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiNoteId: 1404,
            ankiDeckNames: ['Core'],
            rid: 404,
        });
        const answerCard = vi.fn(async () => {});
        const grade = vi.fn();
        const requestCurrent = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                jpdbMiningEnabled: true,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
                enableReviews: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: { answerCard } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                grade,
                requestCurrent,
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as {
            loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
            loadAnkiWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
        }, {
            async loadJpdbWords() {
                return { cards: [jpdbCard], sourceLabel: 'JPDB', reviewCountMode: true };
            },
            async loadAnkiWords() {
                return { cards: [ankiCard], sourceLabel: 'Anki', reviewCountMode: true };
            },
        });

        try {
            await controller.renderPage();

            const words = (controller as unknown as { allWords: JPDBCard[] }).allWords;
            expect(words).toHaveLength(1);
            expect(words[0]).toMatchObject({
                spelling: '日本語',
                reading: 'にほんご',
                reviewSource: 'jpdb-live',
                ankiCardId: 404,
                ankiNoteId: 1404,
                ankiDeckNames: ['Core'],
            });
            expect(newTabStatusButton().textContent).toContain('JPDB + Anki');

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(grade).toHaveBeenCalledWith('okay');
            expect(requestCurrent).toHaveBeenCalled();
            expect(answerCard).toHaveBeenCalledWith(404, 'okay');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('submits one new-tab grade to both JPDB and Anki when a review card has both targets', async () => {
        const { card, reviewCard, answerCard, controller, root } = renderJpdbAnkiReviewWordFixture();

        try {
            const targetSelect = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]');
            expect(targetSelect?.selectedOptions[0]?.textContent).toBe('Both');
            expect(targetSelect?.selectedOptions[0]?.dataset.newtabGradeTargetLabel).toBe('Grades JPDB + Anki card: Core #404');
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Both');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            expect(answerCard).toHaveBeenCalledWith(404, 'okay');
        } finally {
            root.remove();
        }
    });

    it('lets the main new-tab grade bar split JPDB and individual Anki targets while keeping Both as the default', async () => {
        const { card, reviewCard, answerCard, root } = renderJpdbAnkiReviewWordFixture({ bindRootEvents: true });

        try {
            const targetSelect = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')!;
            expect(Array.from(targetSelect.options).map(option => option.textContent)).toEqual([
                'Both',
                'JPDB',
                'Core #404',
                'Core #405',
            ]);
            expect(targetSelect.value).toBe('both');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Both');

            targetSelect.value = 'jpdb';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(targetSelect.selectedOptions[0]?.textContent).toBe('JPDB');
            expect(root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.getAttribute('aria-label')).toBe('Okay: Grades JPDB');
            root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.click();

            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            });
            expect(answerCard).not.toHaveBeenCalled();

            targetSelect.value = 'anki:405';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(targetSelect.selectedOptions[0]?.textContent).toBe('Core #405');
            expect(targetSelect.selectedOptions[0]?.dataset.newtabGradeTargetLabel).toBe('Grades Anki card: Core #405');
            expect(root.querySelector<HTMLButtonElement>('[data-grade="easy"]')?.getAttribute('aria-label')).toBe('Easy: Grades Anki card: Core #405');
            root.querySelector<HTMLButtonElement>('[data-grade="easy"]')?.click();

            await waitForExpect(() => {
                expect(answerCard).toHaveBeenCalledWith(405, 'easy');
            });
            expect(reviewCard).toHaveBeenCalledTimes(1);
        } finally {
            root.remove();
        }
    });

    it('lets Anki-only duplicate cards choose the exact Anki card to grade', async () => {
        const card = newTabTestCard({
            vid: -1,
            sid: -1,
            rid: 404,
            spelling: '読む',
            reading: 'よむ',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiDeckNames: ['RRTK'],
            ankiRenderedCards: [
                { cardId: 404, deckName: 'RRTK', cardName: 'Recognition', question: '読む', answer: 'read' },
                { cardId: 405, deckName: 'Core', cardName: 'Production', question: '読む', answer: 'reading vocabulary' },
            ],
        });
        const answerCard = vi.fn(async () => {});
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }), {
            anki: { answerCard } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: true },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        try {
            const targetSelect = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')!;
            expect(Array.from(targetSelect.options).map(option => option.textContent)).toEqual([
                'RRTK · Recognition #404',
                'Core · Production #405',
            ]);
            expect(targetSelect.value).toBe('anki:404');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('RRTK · Recognition #404');
            expect(newTabSourceSelect(root).value).toBe('anki');
            expect(root.querySelector('[data-newtab-status]')?.textContent).not.toContain('JPDB');

            targetSelect.value = 'anki:405';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(targetSelect.selectedOptions[0]?.textContent).toBe('Core · Production #405');
            expect(targetSelect.selectedOptions[0]?.dataset.newtabGradeTargetLabel).toBe('Grades Anki card: Core · Production #405');
            root.querySelector<HTMLButtonElement>('[data-grade="hard"]')?.click();

            await waitForExpect(() => {
                expect(answerCard).toHaveBeenCalledWith(405, 'hard');
            });
        } finally {
            root.remove();
        }
    });

    it('queues only the failed provider when one half of a dual-source review grade is offline', async () => {
        const card = newTabTestCard({
            vid: 250,
            sid: 1,
            rid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiRenderedCards: [
                { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                { cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' },
            ],
        });
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => { throw new Error('anki offline'); });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                enableReviews: true,
                newTabOfflineEnabled: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: { answerCard } as never,
            jpdb: { reviewCard } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: true },
        });
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        try {
            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            expect(answerCard).toHaveBeenCalledWith(404, 'okay');
            const queue = readNewTabGradeQueue();
            expect(queue).toHaveLength(1);
            expect(queue[0]).toMatchObject({ target: 'anki', grade: 'okay', attempts: 0 });
        } finally {
            root.remove();
        }
    });

    it('reloads the Anki SRS queue after grading instead of reusing a stale source cache', async () => {
        document.body.replaceChildren();
        const first = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404, rid: 404 });
        const second = newTabTestCard({ spelling: '次回', reading: 'じかい', source: 'anki', reviewSource: 'anki', ankiCardId: 405, rid: 405 });
        const listNewTabCards = vi.fn(async (): Promise<JPDBCard[]> => [second]);
        listNewTabCards.mockResolvedValueOnce([first]);
        const answerCard = vi.fn(async () => {});
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'anki',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: { listNewTabCards, answerCard } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab')!;
        const internals = controller as unknown as {
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            visibleWords: JPDBCard[];
            index: number;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            gradeCurrentCard(grade: 'pass'): Promise<void>;
        };
        internals.state.revealAnswer = true;
        internals.renderWord(root, first);

        await internals.gradeCurrentCard('pass');

        expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        await waitForExpect(() => {
            expect(listNewTabCards).toHaveBeenCalledTimes(2);
            expect(newTabPromptText()).toBe('次回');
        });
    });

    it('does not let stale in-flight Anki source responses repopulate the cache after grading', async () => {
        const stale = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404, rid: 404 });
        const fresh = newTabTestCard({ spelling: '次回', reading: 'じかい', source: 'anki', reviewSource: 'anki', ankiCardId: 405, rid: 405 });
        const staleLoad = deferred<JPDBCard[]>();
        const listNewTabCards = vi.fn(async (): Promise<JPDBCard[]> => staleLoad.promise);
        listNewTabCards.mockImplementationOnce(() => staleLoad.promise).mockResolvedValueOnce([fresh]);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true }),
            anki: { listNewTabCards, answerCard: vi.fn() } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const internals = controller as unknown as {
            loadWordsFromSource(source: 'anki'): Promise<{ cards: JPDBCard[] }>;
            invalidateReviewSourceCache(card: JPDBCard): void;
        };

        const oldLoad = internals.loadWordsFromSource('anki');
        internals.invalidateReviewSourceCache(stale);
        staleLoad.resolve([stale]);

        await expect(oldLoad).resolves.toMatchObject({
            cards: [expect.objectContaining({ spelling: '復習' })],
        });
        await expect(internals.loadWordsFromSource('anki')).resolves.toMatchObject({
            cards: [expect.objectContaining({ spelling: '次回' })],
        });

        expect(listNewTabCards).toHaveBeenCalledTimes(2);
    });

    it('reloads fresh queues after the last graded card without using stale offline cache', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS }));
        const root = document.createElement('main');
        const reload = vi.fn();
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto: typeof reload;
        }, {
            allWords: [card],
            visibleWords: [card],
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: true },
            loadWordsInto: reload,
        });

        (controller as unknown as { advanceAfterGrade(root: HTMLElement, card: JPDBCard): void }).advanceAfterGrade(root, card);

        expect(reload).toHaveBeenCalledWith(root, false, { useOfflineCache: false });
    });

    it('refreshes the review source after grading while preserving the next visible card', () => {
        const graded = newTabTestCard({ vid: 1, sid: 1, spelling: '採点', source: 'jpdb', reviewSource: 'jpdb-api' });
        const next = newTabTestCard({ vid: 2, sid: 1, spelling: '次', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
        const reload = vi.fn();
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto: typeof reload;
        }, {
            allWords: [graded, next],
            visibleWords: [graded, next],
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
            loadWordsInto: reload,
        });

        (controller as unknown as { advanceAfterGrade(root: HTMLElement, card: JPDBCard): void }).advanceAfterGrade(root, graded);

        expect(newTabPromptText(root)).toBe('次');
        expect(reload).toHaveBeenCalledWith(root, true, {
            useOfflineCache: false,
            quiet: true,
            excludeCardKeys: [cardKey(graded)],
            preserveVisibleOrder: true,
        });
    });

    it('undoes the grade locally when Previous is pressed right after grading (UT-58)', async () => {
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-newtab').forEach(root => root.remove());
        const graded = newTabTestCard({ vid: 1, sid: 1, spelling: '採点', reading: 'さいてん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const next = newTabTestCard({ vid: 2, sid: 1, spelling: '次', reading: 'つぎ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
        }, {
            jpdb: { reviewCard } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const loadWordsInto = vi.fn(async () => {});
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            bindRootEvents(root: HTMLElement): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            loadWordsInto: typeof loadWordsInto;
        };
        try {
            Object.assign(internals, {
                allWords: [graded, next],
                visibleWords: [graded, next],
                index: 0,
                reviewCountMode: true,
                sourceLabel: 'JPDB',
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
                loadWordsInto,
            });
            internals.bindRootEvents(root);
            internals.renderWord(root, graded);

            root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.click();
            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledWith(graded, 'okay');
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('次');
            });

            // UT-58: Previous right after a grade IS the undo gesture — the
            // graded card returns to the front (locally for JPDB: the
            // upstream review stands) and the session counter walks back.
            root.querySelector<HTMLButtonElement>('[data-newtab-action="previous"]')?.click();
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('採点');
            });
            expect(reviewCard).toHaveBeenCalledTimes(1);
            expect(root.querySelector<HTMLElement>('[data-newtab-count]')?.dataset.sessionCompletedReviews).toBe('0');
            // With the undo consumed, Previous is plain navigation again.
            showNextNewTabWord(controller);
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('次');
            });
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('keeps undo on the Previous control without rendering a separate undo button', () => {
        const graded = newTabTestCard({ vid: 1, sid: 1, spelling: '採点', reading: 'さいてん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const current = newTabTestCard({ vid: 2, sid: 1, spelling: '次', reading: 'つぎ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
        }));
        const root = renderSeededNewTabWord(controller, current, {
            allWords: [current],
            visibleWords: [current],
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: true },
        });
        const internals = controller as unknown as {
            lastUndoableReview?: { card: JPDBCard; at: number; serverUndo: boolean; counted: boolean };
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        try {
            internals.lastUndoableReview = { card: graded, at: Date.now(), serverUndo: false, counted: true };
            internals.renderWord(root, current);

            expect(root.querySelector('[data-newtab-action="undo-review"]')).toBeNull();
            expect(root.querySelectorAll('[data-grade]').length).toBeGreaterThan(0);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('leaves Previous as a no-op on the first card when there is no undo review', () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '最初', reading: 'さいしょ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const second = newTabTestCard({ vid: 2, sid: 1, spelling: '最後', reading: 'さいご', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
        }));
        const root = renderSeededNewTabWord(controller, first, {
            allWords: [first, second],
            visibleWords: [first, second],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: false },
            appendToDocument: true,
            bindRootEvents: true,
        });
        try {
            expect(root.querySelector('[data-newtab-action="previous"]')).not.toBeNull();

            root.querySelector<HTMLButtonElement>('[data-newtab-action="previous"]')?.click();

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('最初');
            expect((controller as unknown as { index: number }).index).toBe(0);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('continues to the following review card after grading the middle of the queue', () => {
        const previous = newTabTestCard({ vid: 1, sid: 1, spelling: '前', reading: 'まえ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const graded = newTabTestCard({ vid: 2, sid: 1, spelling: '採点', reading: 'さいてん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const next = newTabTestCard({ vid: 3, sid: 1, spelling: '次', reading: 'つぎ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
        const reload = vi.fn();
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto: typeof reload;
        }, {
            allWords: [previous, graded, next],
            visibleWords: [previous, graded, next],
            index: 1,
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
            loadWordsInto: reload,
        });

        (controller as unknown as { advanceAfterGrade(root: HTMLElement, card: JPDBCard): void }).advanceAfterGrade(root, graded);

        expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('次');
        expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['前', '次']);
    });
});

function scopeQueuedNetworkGradesTo(controller: NewTabController): void {
    const contexts = (controller as unknown as {
        providerContexts: Parameters<typeof newTabReviewProviderContext>[0];
    }).providerContexts;
    const queue = readNewTabGradeQueue().map(item => item.target === 'yomu-local'
        ? item
        : {
            ...item,
            providerContext: newTabReviewProviderContext(
                contexts,
                item.target as Parameters<typeof newTabReviewProviderContext>[1],
            ),
        });
    localStorage.setItem(NEW_TAB_GRADE_QUEUE_KEY, JSON.stringify(queue));
}
