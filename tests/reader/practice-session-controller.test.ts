import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureManagedWebStorageCurrent, managedSessionStorage } from '../../src/reader/app/storage';
import * as storage from '../../src/reader/app/storage';
import type { JPDBCard } from '../../src/reader/app/types';
import { cardKey } from '../../src/reader/cards/utils';
import { DEFAULT_NEW_TAB_UI_STATE } from '../../src/reader/newtab/state';
import { PracticeSessions } from '../../src/reader/study/practice-session';
import { PracticeSessionPanel, practiceSessionTabOpen } from '../../src/reader/study/practice-session-panel';
import { PracticeSessionStore } from '../../src/reader/study/practice-session-store';
import { createYomuLocalSrsAdapter, LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { LocalYomuSrsStore } from '../../src/reader/srs/local-yomu-store';
import {
    allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlClick,
    dispatchAuthorizedReaderControlEvent, installTrustedReaderRootBoundary,
} from '../../src/reader/ui/trusted-interaction';
import {
    DEFAULT_SETTINGS, NewTabController, deferred, newTabPromptController, newTabTestCard,
    registerNewTabReviewCleanup, renderEnabledNewTabRoot,
} from './new-tab-review/fixtures';

const TAB_KEY = 'yomu:practice-session-tab:v1';
type ControllerProbe = {
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    index: number;
    state: typeof DEFAULT_NEW_TAB_UI_STATE;
    practicePanel?: PracticeSessionPanel;
    bindRootEvents(root: HTMLElement): void;
    renderWord(root: HTMLElement, card: JPDBCard): void;
    loadWordsInto(root: HTMLElement, preferStoredWord: boolean): Promise<void>;
    handleNewTabSwipe(root: HTMLElement, action: 'again', direction: 'left'): void;
    canSwipeCurrentStudyCard(): boolean;
    swipeStartAllowedForStepNavigation(target: HTMLElement | null): boolean;
};

describe('Practice controller integration', () => {
    registerNewTabReviewCleanup();
    const controllers: NewTabController[] = [];
    let boundary: AbortController;
    let sessions: PracticeSessions;

    beforeEach(async () => {
        const factory = new IDBFactory();
        vi.stubGlobal('indexedDB', factory);
        sessions = new PracticeSessions(factory);
        await ensureManagedWebStorageCurrent();
        managedSessionStorage.removeItem(TAB_KEY);
        boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);
        allowSyntheticReaderInteractionsForTests(false);
    });

    afterEach(() => {
        controllers.splice(0).forEach(controller => controller.destroy());
        boundary.abort();
        allowSyntheticReaderInteractionsForTests(true);
        managedSessionStorage.removeItem(TAB_KEY);
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    function controller() {
        const reviewCard = vi.fn(async () => undefined);
        const instance = newTabPromptController({
            ...DEFAULT_SETTINGS, apiKey: 'fixture-key', interfaceLanguage: 'en', newTabSource: 'jpdb',
            ankiEnabled: false, newTabAnkiEnabled: false, immersionKitEnabled: false, audioEnabled: false,
            newTabSwipeReviews: true,
        }, {
            jpdb: { reviewCard } as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }) } as never,
        });
        controllers.push(instance);
        return { controller: instance, probe: instance as unknown as ControllerProbe, reviewCard };
    }

    function fixture(empty = false) {
        const result = controller();
        const card = newTabTestCard({
            spelling: '水', reading: 'みず', meanings: [{ glosses: ['water'], partOfSpeech: [] }],
            source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'], sentence: '水を飲む。',
        });
        const root = renderEnabledNewTabRoot(result.controller, { appendToDocument: true });
        Object.assign(result.probe, {
            allWords: empty ? [] : [card], visibleWords: empty ? [] : [card], index: 0,
            reviewCountMode: true, sourceLabel: 'JPDB', state: { ...DEFAULT_NEW_TAB_UI_STATE, source: 'jpdb' },
        });
        if (!empty) result.probe.renderWord(root, card);
        // Exercise the actual empty standalone queue gate, not just an empty array.
        root.dataset.standaloneNewtab = 'true';
        result.probe.bindRootEvents(root);
        return { ...result, root, card };
    }

    function click(root: ParentNode, selector: string) {
        const control = root.querySelector<HTMLElement>(selector);
        expect(control, selector).not.toBeNull();
        dispatchAuthorizedReaderControlClick(control!);
    }

    async function open(root: HTMLElement) {
        click(root, '[data-newtab-action="practice-sessions"]');
        await vi.waitFor(() => expect(root.querySelector('[data-practice-purpose]')).not.toBeNull());
        expect(root.dataset.practiceActive).toBe('true');
    }

    async function start(root: HTMLElement, purpose = 'writing') {
        await open(root);
        root.querySelector<HTMLSelectElement>('[data-practice-purpose]')!.value = purpose;
        click(root, '[data-practice-action="start"]');
        await vi.waitFor(() => expect(root.querySelector('.yomu-practice-prompt')).not.toBeNull());
        const [record] = await sessions.list();
        expect(record).toBeDefined();
        return record!.id;
    }

    it('opens saved Practice through navigation even when the standalone native queue is empty', async () => {
        const prepared = await sessions.start({ purpose: 'recognition', title: 'Offline words', material: [
            { id: 'saved-water', language: 'ja', spelling: '水', reading: 'みず', meaning: 'water' },
        ] });
        const { root, probe } = fixture(true);
        expect(probe.allWords).toEqual([]);
        await open(root);
        await vi.waitFor(() => expect(root.querySelector('[data-practice-action="resume"]')).not.toBeNull());
        click(root, '[data-practice-action="resume"]');
        await vi.waitFor(() => expect(root.querySelector('.yomu-practice-prompt')?.textContent).toBe('水'));
        expect(JSON.parse(managedSessionStorage.getItem(TAB_KEY)!)).toMatchObject({ sessionId: prepared.view().id });
        expect(probe.practicePanel).toBeInstanceOf(PracticeSessionPanel);
    });

    it('blocks native hotkeys, swipes and lookup grading while Practice is open, then restores native grading on leave', async () => {
        const { root, card, probe, controller: current, reviewCard } = fixture();
        // A second native card makes an accidental navigation observable.
        const nextCard = newTabTestCard({ spelling: '本', reading: 'ほん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        probe.allWords.push(nextCard);
        probe.visibleWords.push(nextCard);
        click(root, '[data-newtab-controls] [data-newtab-action="reveal"]');
        expect(current.lookupReviewTargets(card).length).toBeGreaterThan(0);
        expect(probe.canSwipeCurrentStudyCard()).toBe(true);
        expect(probe.swipeStartAllowedForStepNavigation(null)).toBe(true);
        const key = () => dispatchAuthorizedReaderControlEvent(root, new KeyboardEvent('keydown', {
            key: '3', code: 'Digit3', bubbles: true, cancelable: true,
        }));
        // Observe shortcut activation without consuming the native card before Practice.
        const gradeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-newtab-controls] [data-grade]')];
        expect(gradeButtons.length).toBeGreaterThan(0);
        const activations = gradeButtons.map(button => vi.spyOn(button, 'click').mockImplementation(() => {}));
        key();
        expect(activations.reduce((count, spy) => count + spy.mock.calls.length, 0)).toBe(1);
        activations.forEach(spy => spy.mockClear());
        const nativeIndex = probe.index;
        const nativeCards = [...probe.visibleWords];
        const id = await start(root, 'recognition');
        expect(probe.canSwipeCurrentStudyCard()).toBe(false);
        expect(probe.swipeStartAllowedForStepNavigation(null)).toBe(false);
        // Exercise a late callback from the swipe engine installed before Practice.
        probe.handleNewTabSwipe(root, 'again', 'left');
        key();
        expect(activations.every(spy => spy.mock.calls.length === 0)).toBe(true);
        expect(current.lookupReviewTargets(card)).toEqual([]);
        expect(current.lookupGradeOptions(card)).toEqual([]);
        await current.gradeFromLookup('okay', undefined, card);
        expect(reviewCard).not.toHaveBeenCalled();
        expect(probe.index).toBe(nativeIndex);
        expect(probe.visibleWords).toEqual(nativeCards);
        expect(probe.visibleWords[probe.index]).toBe(card);
        expect((await sessions.resume(id)).view()).toMatchObject({ position: 0, current: { response: { revealed: false } } });
        click(root, '[data-newtab-action="mode"][data-mode="word"]');
        await vi.waitFor(() => expect(root.dataset.practiceActive).toBeUndefined());
        expect(current.lookupReviewTargets(card).length).toBeGreaterThan(0);
        click(root, '[data-newtab-controls] [data-grade]');
        await vi.waitFor(() => expect(reviewCard).toHaveBeenCalledOnce());
    });

    it('completes durable recognition practice without submitting or changing a native schedule', async () => {
        const now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const cards = [
            newTabTestCard({ vid: 701, sid: 1, spelling: '水', reading: 'みず',
                meanings: [{ glosses: ['water'], partOfSpeech: [] }], sentence: '水を飲む。',
                pitchAccent: ['LHH'], source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] }),
            newTabTestCard({ vid: 702, sid: 1, spelling: '本', reading: 'ほん',
                meanings: [{ glosses: ['book'], partOfSpeech: [] }], sentence: '本を読む。',
                pitchAccent: ['HLL'], source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] }),
        ];
        const scheduleKey = (key: unknown) => typeof key === 'string'
            && (key.includes('yomu:srs-local:') || key.includes('yomu-pitch-'));
        const storedSchedules = () => Object.fromEntries(Object.keys(localStorage).filter(scheduleKey)
            .sort().map(key => [key, localStorage.getItem(key)]));
        const originalStorage = storedSchedules();
        const asyncSet = vi.spyOn(storage, 'gmStorageSet');
        const mutations = [
            asyncSet, vi.spyOn(storage, 'gmStorageSetSync'),
            vi.spyOn(storage, 'gmStorageDelete'), vi.spyOn(storage, 'gmStorageDeleteSync'),
            vi.spyOn(Storage.prototype, 'setItem'), vi.spyOn(Storage.prototype, 'removeItem'),
        ];
        const writeDeck = vi.spyOn(LocalYomuSrsStore.prototype, 'write');
        const localReview = vi.spyOn(repository, 'review'); // Call through to the real scheduler.
        const reviewCard = vi.fn(async () => undefined);
        const answerCard = vi.fn(async () => undefined);
        const jitenReview = vi.fn(async () => undefined);
        const liveGrade = vi.fn();
        let current: NewTabController | undefined;
        try {
            expect(Object.keys((await repository.snapshot()).cards)).toEqual([]);
            await repository.importBatch({ source: 'practice-isolation', importedAt: now,
                items: cards.map((card, index) => ({
                    expression: card.spelling, reading: card.reading, language: 'ja', partOfSpeech: 'n',
                    meanings: card.meanings.flatMap(meaning => meaning.glosses),
                    sentence: card.sentence, dueAt: now - 2 + index,
                })),
            });
            // Prove that the audit observes real asynchronous local-deck persistence.
            expect(writeDeck).toHaveBeenCalledOnce();
            expect(asyncSet.mock.calls.some(([key]) => key === 'yomu:srs-local:v2:index')).toBe(true);
            const beforeDeck = await repository.snapshot();
            const beforeQueue = await repository.queue(2);
            expect(beforeQueue.cards.map(card => card.expression)).toEqual(['水', '本']);
            const pitchKeys = ['yomu-pitch-items:v1', 'yomu-pitch-history:v1'];
            const beforePitch = await Promise.all(pitchKeys.map(key => storage.gmStorageGet(key, null)));
            expect(beforePitch).toEqual([null, null]);
            const beforeStorage = storedSchedules();
            mutations.forEach(spy => spy.mockClear());
            writeDeck.mockClear();

            current = newTabPromptController({
                ...DEFAULT_SETTINGS, apiKey: 'fixture-key', interfaceLanguage: 'en', newTabSource: 'jpdb',
                enableReviews: true, jpdbMiningEnabled: true, yomuLocalSrsEnabled: true,
                ankiEnabled: false, newTabAnkiEnabled: false, immersionKitEnabled: false, audioEnabled: false,
                newTabParsingEnabled: false, newTabFrontSentenceEnabled: false,
            }, {
                jpdb: { reviewCard } as never, anki: { answerCard } as never,
                jiten: { reviewCard: jitenReview } as never,
                jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }), grade: liveGrade } as never,
                srsAdapters: { 'yomu-local': createYomuLocalSrsAdapter(repository) },
            });
            controllers.push(current);
            const probe = current as unknown as ControllerProbe;
            const root = renderEnabledNewTabRoot(current, { appendToDocument: true });
            Object.assign(probe, {
                allWords: [...cards], visibleWords: [...cards], index: 0, reviewCountMode: true,
                sourceLabel: 'JPDB', state: { ...DEFAULT_NEW_TAB_UI_STATE, source: 'jpdb' },
            });
            probe.renderWord(root, cards[0]!);
            root.dataset.standaloneNewtab = 'true';
            probe.bindRootEvents(root);
            click(root, '[data-newtab-controls] [data-newtab-action="reveal"]');
            expect(current.lookupReviewTargets(cards[0]!).length).toBeGreaterThan(0);
            expect(root.querySelectorAll('[data-newtab-controls] [data-grade]').length).toBeGreaterThan(0);
            const beforeNativeCards = structuredClone(cards);
            const token = root.querySelector<HTMLElement>('[data-newtab-study]')!.dataset.newtabCard;
            const id = await start(root, 'recognition');
            expect(probe.practicePanel).toBeInstanceOf(PracticeSessionPanel);

            for (const [index, card] of cards.entries()) {
                await vi.waitFor(() => expect(root.querySelector('.yomu-practice-prompt')?.textContent).toBe(card.spelling));
                expect(root.querySelector('[data-practice-answer]')).toBeNull();
                click(root, '[data-practice-command="reveal"]');
                await vi.waitFor(() => expect(root.querySelector('[data-practice-answer]')?.textContent).toContain(card.reading));
                const remembered = [...root.querySelectorAll<HTMLButtonElement>('[data-practice-command="self-check"]')]
                    .find(button => button.textContent === 'I remembered');
                expect(remembered).toBeDefined();
                expect(remembered!.disabled).toBe(false);
                dispatchAuthorizedReaderControlClick(remembered!);
                await vi.waitFor(async () => expect((await sessions.resume(id)).view().position).toBe(index + 1));
            }

            await vi.waitFor(() => expect(root.querySelector('[data-practice-panel] h2')?.textContent).toBe('Session complete'));
            const restored = await new PracticeSessions(indexedDB).resume(id);
            expect(restored.view()).toMatchObject({
                id, purpose: 'recognition', status: 'complete', phase: 'complete', transitionPending: false,
                position: 2, total: 2, sourceTotal: 2, ineligible: 0, current: null,
            });
            restored.close();
            const durable = await new PracticeSessionStore(indexedDB).read(id);
            expect(durable).toMatchObject({
                id, purpose: 'recognition', revision: 4, position: 2, paused: false, ineligible: [],
                material: cards.map(card => ({ id: cardKey(card), spelling: card.spelling, reading: card.reading })),
                responses: Object.fromEntries(cards.map(card => [cardKey(card), {
                    draft: '', revealed: true, attempts: 0, selfCheck: 'recalled',
                }])),
            });
            expect((durable as { responses: unknown }).responses).toEqual(Object.fromEntries(cards.map(card => [
                cardKey(card), { draft: '', revealed: true, attempts: 0, selfCheck: 'recalled' },
            ])));
            expect(probe.index).toBe(0);
            expect(probe.allWords).toEqual(cards);
            expect(probe.visibleWords).toEqual(cards);
            expect(cards).toEqual(beforeNativeCards);
            expect(probe.visibleWords[probe.index]).toBe(cards[0]);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')!.dataset.newtabCard).toBe(token);
            expect(probe.state.revealAnswer).toBe(true);
            click(root, '[data-practice-action="exit"]');
            await vi.waitFor(() => expect(root.dataset.practiceActive).toBeUndefined());
            expect(probe.visibleWords[probe.index]).toBe(cards[0]);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')!.dataset.newtabCard).toBe(token);
            current.destroy();

            // Include teardown and the old pitch store's 400 ms write-behind window.
            await new Promise(resolve => setTimeout(resolve, 450));
            // snapshot() joins the real local repository's asynchronous mutation queue.
            const reloaded = new LocalYomuSrsRepository(() => now);
            expect(await reloaded.snapshot()).toEqual(beforeDeck);
            expect(await reloaded.queue(2)).toEqual(beforeQueue);
            expect(await Promise.all(pitchKeys.map(key => storage.gmStorageGet(key, null)))).toEqual(beforePitch);
            expect(storedSchedules()).toEqual(beforeStorage);
            expect(writeDeck).not.toHaveBeenCalled();
            expect(localReview).not.toHaveBeenCalled();
            for (const spy of mutations) expect(spy.mock.calls.filter(([key]) => scheduleKey(key))).toEqual([]);
            for (const submit of [reviewCard, answerCard, jitenReview, liveGrade]) expect(submit).not.toHaveBeenCalled();
        } finally {
            current?.destroy();
            mutations.forEach(spy => spy.mockRestore());
            writeDeck.mockRestore();
            localReview.mockRestore();
            for (const key of Object.keys(storedSchedules())) if (!(key in originalStorage)) localStorage.removeItem(key);
            for (const [key, value] of Object.entries(originalStorage)) if (value !== null) localStorage.setItem(key, value);
        }
    });

    it('reconstructs through renderPage with the durable draft and no native load', async () => {
        const first = fixture();
        const id = await start(first.root);
        const input = first.root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        input.value = 'み';
        dispatchAuthorizedReaderControlEvent(input, new Event('input', { bubbles: true }));
        await vi.waitFor(async () => expect((await sessions.resume(id)).view().current?.response.draft).toBe('み'));
        first.controller.destroy();
        document.body.replaceChildren();
        const restored = controller();
        const nativeLoad = vi.spyOn(restored.probe, 'loadWordsInto'); // Observe; never replace the loader.
        expect(restored.probe.allWords).toEqual([]);
        await restored.controller.renderPage();
        const root = document.querySelector<HTMLElement>('.jpdb-reader-newtab')!;
        expect(restored.probe.practicePanel).toBeInstanceOf(PracticeSessionPanel);
        expect(root.dataset.practiceActive).toBe('true');
        expect(root.querySelector('.yomu-practice-prompt')?.textContent).toBe('water');
        expect(root.querySelector<HTMLInputElement>('[data-practice-input]')?.value).toBe('み');
        expect(JSON.parse(managedSessionStorage.getItem(TAB_KEY)!)).toMatchObject({ sessionId: id });
        expect(nativeLoad).not.toHaveBeenCalled();
        expect(restored.reviewCard).not.toHaveBeenCalled();
    });

    it('does not let an older pending leave hide a newer Practice navigation or clear its pointer', async () => {
        const { root, probe } = fixture();
        const id = await start(root);
        const panel = probe.practicePanel!;
        const release = deferred<void>();
        const entered = deferred<void>();
        const pause = panel.pause.bind(panel);
        const delayedPause = vi.spyOn(panel, 'pause').mockImplementationOnce(async () => {
            const result = await pause(); // Real checkpoint; delay only the dependency completion.
            entered.resolve();
            await release.promise;
            return result;
        });
        try {
            click(root, '[data-newtab-action="mode"][data-mode="word"]');
            await entered.promise;
            expect((await sessions.resume(id)).view().status).toBe('paused');
            click(root, '[data-newtab-action="practice-sessions"]');
            const pointer = managedSessionStorage.getItem(TAB_KEY);
            expect(JSON.parse(pointer!)).toMatchObject({ sessionId: id });
            release.resolve();
            await delayedPause.mock.results[0]!.value;
            // Yield past the controller continuation consuming pause's result.
            await Promise.resolve();
            expect(root.dataset.practiceActive).toBe('true');
            expect(panel.element.hidden).toBe(false);
            expect(panel.element.isConnected).toBe(true);
            expect(practiceSessionTabOpen()).toBe(true);
            expect(managedSessionStorage.getItem(TAB_KEY)).toBe(pointer);
            expect(root.querySelector('[data-newtab-action="practice-sessions"]')?.getAttribute('aria-pressed')).toBe('true');
            click(root, '[data-practice-command="continue"]');
            await vi.waitFor(() => expect(root.querySelector('[data-practice-input]')).not.toBeNull());
        } finally { release.resolve(); }
    });
});
