import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEW_TAB_UI_STATE } from '../../src/reader/newtab/state';
import type { JPDBCard } from '../../src/reader/app/types';
import { isHostedYomuOrigin } from '../../src/reader/app/storage';
import {
    allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlClick,
    dispatchAuthorizedReaderControlEvent, installTrustedReaderRootBoundary,
} from '../../src/reader/ui/trusted-interaction';
import { DEFAULT_SETTINGS, newTabPromptController, newTabTestCard, registerNewTabReviewCleanup, renderEnabledNewTabRoot } from './new-tab-review/fixtures';

describe('native Study trusted keyboard input', () => {
    registerNewTabReviewCleanup();
    let boundary: AbortController;
    let cleanup: () => void;
    beforeEach(() => {
        boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);
        allowSyntheticReaderInteractionsForTests(false);
        cleanup = () => {};
    });
    afterEach(() => {
        cleanup();
        boundary.abort();
        allowSyntheticReaderInteractionsForTests(true);
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    function fixture() {
        const review = vi.fn(async () => undefined);
        const card = newTabTestCard({ spelling: '水', reading: 'みず', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS, apiKey: 'test-key', interfaceLanguage: 'en', enableReviews: true,
            immersionKitEnabled: false, audioEnabled: false, newTabAnkiEnabled: false,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, gradeOkay: '4', studyReveal: 'Space' },
        }, {
            jpdb: { reviewCard: review } as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }), reveal: vi.fn() } as never,
        });
        cleanup = () => controller.destroy();
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const probe = controller as unknown as {
            renderWord(root: HTMLElement, card: JPDBCard): void;
            bindRootEvents(root: HTMLElement): void;
        };
        Object.assign(probe, {
            allWords: [card], visibleWords: [card], index: 0, reviewCountMode: true, sourceLabel: 'JPDB',
            state: { ...DEFAULT_NEW_TAB_UI_STATE, source: 'jpdb' },
        });
        probe.renderWord(root, card);
        probe.bindRootEvents(root);
        const reveal = () => dispatchAuthorizedReaderControlClick(root.querySelector<HTMLButtonElement>('[data-newtab-controls] [data-newtab-action="reveal"]')!);
        return { root, review, card, reveal };
    }

    function key(value: string, options: KeyboardEventInit = {}, target: EventTarget = document.body) {
        const event = new KeyboardEvent('keydown', { key: value, code: value === ' ' ? 'Space' : `Digit${value}`, bubbles: true, cancelable: true, ...options });
        dispatchAuthorizedReaderControlEvent(target, event);
        return event;
    }

    it('submits exactly one native grade from a trusted body-focused shortcut', async () => {
        const { reveal, review, card } = fixture();
        reveal();
        expect(key('4').defaultPrevented).toBe(true);
        await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
        expect(review).toHaveBeenCalledWith(card, 'okay');
    });

    it('reveals and grades through a fully keyboard-driven sequence', async () => {
        const { root, review, card } = fixture();
        expect(key(' ').defaultPrevented).toBe(true);
        expect(root.querySelector('[data-newtab-controls] [data-grade]')).not.toBeNull();
        expect(review).not.toHaveBeenCalled();
        key('4');
        await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
        expect(review).toHaveBeenCalledWith(card, 'okay');
    });

    it('ignores a page-created body key event before granting a control click', async () => {
        const { root, review } = fixture();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
        expect(root.querySelector('[data-newtab-controls] [data-grade]')).toBeNull();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '4', code: 'Digit4', bubbles: true, cancelable: true }));
        expect(review).not.toHaveBeenCalled();
    });

    it.each([false, true])('rejects fabricated keys after a legitimate reveal (hosted: %s)', hosted => {
        if (hosted) vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        expect(isHostedYomuOrigin()).toBe(hosted);
        const { reveal, review } = fixture();
        reveal();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '4', code: 'Digit4', bubbles: true, cancelable: true }));
        expect(review).not.toHaveBeenCalled();
    });

    it('does not lend a shortcut grant to a reentrant click on another grade', async () => {
        const { root, reveal, review, card } = fixture();
        reveal();
        const grade = root.querySelector<HTMLButtonElement>('[data-grade="okay"]')!;
        const other = root.querySelector<HTMLButtonElement>('[data-grade="nothing"]')!;
        let attempted = false;
        root.addEventListener('click', event => {
            if (event.target === grade) { attempted = true; other.click(); }
        }, { capture: true });
        key('4');
        await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
        expect(attempted).toBe(true);
        expect(review).toHaveBeenCalledWith(card, 'okay');
    });

    it.each([
        ['held', { repeat: true }], ['composing', { isComposing: true }], ['IME fallback', { keyCode: 229 }],
    ] as const)('ignores %s shortcut events', (_name, options) => {
        const { root, review } = fixture();
        key(' ', options);
        expect(root.querySelector('[data-newtab-controls] [data-grade]')).toBeNull();
        expect(review).not.toHaveBeenCalled();
    });

    it('does not act behind an inert Study surface or a consumed key event', () => {
        const { root, review } = fixture();
        root.setAttribute('inert', '');
        key(' ');
        expect(root.querySelector('[data-newtab-controls] [data-grade]')).toBeNull();
        root.removeAttribute('inert');
        const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
        event.preventDefault();
        dispatchAuthorizedReaderControlEvent(document.body, event);
        expect(root.querySelector('[data-newtab-controls] [data-grade]')).toBeNull();
        expect(review).not.toHaveBeenCalled();
    });
});
