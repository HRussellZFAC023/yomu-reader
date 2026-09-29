import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import {
    DEFAULT_SETTINGS, NEW_TAB_UI_KEY, newTabBareController, newTabLiveKanjiStatus,
    registerNewTabReviewCleanup, renderEnabledNewTabRoot, stubKanjiDoodleBrowserApis,
} from './new-tab-review/fixtures';

const routeState = { route: 'study', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false };

describe('native kanji review contract', () => {
    registerNewTabReviewCleanup();
    const cleanups: Array<() => void> = [];
    afterEach(() => {
        cleanups.splice(0).reverse().forEach(cleanup => cleanup());
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    async function fixture(options: { obsoleteMode?: boolean; academy?: boolean; noKeyword?: boolean } = {}) {
        localStorage.setItem(NEW_TAB_UI_KEY, JSON.stringify(options.obsoleteMode
            ? { ...routeState, mode: 'kanji', listenSubMode: 'shadow' } : routeState));
        cleanups.push(stubKanjiDoodleBrowserApis());
        const status = newTabLiveKanjiStatus();
        if (options.noKeyword) Object.assign(status.card, { prompt: '', keyword: '' });
        const grade = vi.fn();
        const reveal = vi.fn();
        const requestCurrent = vi.fn();
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key', jpdbMiningEnabled: true, enableReviews: true,
            newTabSource: 'jpdb', newTabJpdbReviewMode: 'live-review',
            immersionKitEnabled: false, newTabParsingEnabled: false, newTabFrontSentenceEnabled: false,
            jpdbKanjiEnabled: false, rtkEnabled: false, kanjivgEnabled: false,
            kanjiOriginsEnabled: false, localDictionariesEnabled: false, localDictionaryShowKanji: false,
            newTabKanjiAutogradeEnabled: false,
        }, {
            jpdbReviewBridge: {
                onUpdate: () => () => {}, latestStatus: () => status, requestCurrent, reveal, grade,
            } as never,
        }, { surface: options.academy ? 'academy' : 'standalone' });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        cleanups.push(() => { controller.destroy(); root.remove(); });
        const internal = controller as unknown as {
            allWords: JPDBCard[]; visibleWords: JPDBCard[]; index: number;
            sourceLabel: string; reviewCountMode: boolean;
            loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }>;
            bindRootEvents(root: HTMLElement): void;
            applyWords(root: HTMLElement, preferStoredWord: boolean): void;
            gradeCurrentCard(grade: 'okay'): Promise<boolean>;
        };
        const loaded = await internal.loadJpdbWords();
        internal.allWords = loaded.cards;
        internal.sourceLabel = loaded.sourceLabel;
        internal.reviewCountMode = loaded.reviewCountMode === true;
        internal.bindRootEvents(root);
        internal.applyWords(root, false);
        requestCurrent.mockClear();
        const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
        const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]')!;
        const click = (selector: string) => {
            const button = root.querySelector<HTMLButtonElement>(selector);
            expect(button, selector).not.toBeNull();
            expect(button!.disabled).toBe(false);
            button!.click();
        };
        const current = () => internal.visibleWords[internal.index];
        return { root, study, prompt, internal, grade, reveal, requestCurrent, click, current };
    }

    it.each([false, true])('reviews native JPDB kanji with persisted route state (obsolete mode: %s)', async obsoleteMode => {
        const f = await fixture({ obsoleteMode });
        expect(f.current()).toMatchObject({ spelling: '記', reviewSource: 'jpdb-live', jpdbReviewId: 'kb,記' });
        expect(f.study.dataset.newtabActivity).toBe('review');
        expect(f.root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
        expect(f.prompt.textContent).toContain('record');
        expect(f.prompt.textContent).not.toContain('記');
        expect(f.root.querySelector('[data-grade]')).toBeNull();
        f.click('[data-newtab-action="reveal"]');
        expect(f.reveal).toHaveBeenCalledOnce();
        expect(f.study.dataset.newtabActivity).toBe('review');
        expect(f.prompt.textContent).toContain('記');
        f.click('[data-newtab-action="grade"][data-grade="okay"]');
        await vi.waitFor(() => {
            expect(f.grade).toHaveBeenCalledOnce();
            expect(f.grade).toHaveBeenCalledWith('okay');
            expect(f.requestCurrent).toHaveBeenCalledOnce();
        });
    });

    it('keeps explicit Academy practice non-gradeable and returns to the same native review', async () => {
        const f = await fixture({ academy: true });
        const native = f.current();
        const token = f.study.dataset.newtabCard;
        expect(f.study.dataset.newtabActivity).toBe('review');
        f.root.querySelector<HTMLElement>('.jpdb-reader-newtab-practice summary')!.click();
        f.click('[data-study-step-kind="kanji-doodle"]');
        expect(f.study.dataset.newtabActivity).toBe('practice');
        f.click('[data-newtab-action="reveal"]');
        expect(f.prompt.textContent).toContain('記');
        expect(f.study.dataset.newtabActivity).toBe('practice');
        expect(f.root.querySelector('[data-grade]')).toBeNull();
        expect(await f.internal.gradeCurrentCard('okay')).toBe(false);
        expect(f.grade).not.toHaveBeenCalled();
        expect(f.reveal).not.toHaveBeenCalled();
        expect(f.requestCurrent).not.toHaveBeenCalled();
        f.click('[data-newtab-action="return-to-review"]');
        expect(f.study.dataset.newtabActivity).toBe('review');
        expect(f.study.dataset.newtabCard).toBe(token);
        expect(f.current()).toBe(native);
        expect(f.current().jpdbReviewId).toBe('kb,記');
        expect(f.prompt.textContent).not.toContain('記');
        f.click('[data-newtab-action="reveal"]');
        expect(f.reveal).toHaveBeenCalledOnce();
        expect(f.root.querySelector('[data-grade="okay"]')).not.toBeNull();
    });

    it('settles an empty-keyword native front asynchronously without exposing its answer', async () => {
        const f = await fixture({ noKeyword: true });
        await vi.waitFor(() => {
            expect(f.prompt.textContent).not.toContain('Loading');
            expect(f.prompt.textContent?.trim()).not.toBe('');
        });
        expect(f.study.dataset.newtabActivity).toBe('review');
        expect(f.prompt.textContent).not.toContain('記');
        expect(f.study.outerHTML).not.toContain('記');
        expect(f.root.querySelector('.jpdb-reader-newtab-doodle')).not.toBeNull();
        f.click('[data-newtab-action="reveal"]');
        expect(f.prompt.textContent).toContain('記');
        expect(f.reveal).toHaveBeenCalledOnce();
    });
});
