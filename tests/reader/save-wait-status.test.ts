import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uiText } from '../../src/reader/app/i18n';
import { reportSaveWaitingForAnotherTab } from '../../src/reader/app/save-wait';
import type { InterfaceLanguage, JPDBCard } from '../../src/reader/app/types';
import { runCardActionOperation } from '../../src/reader/cards/action-operation';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { DEFAULT_NEW_TAB_UI_STATE } from '../../src/reader/newtab/state';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { createYomuLocalSrsAdapter, LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlClick, installTrustedReaderRootBoundary } from '../../src/reader/ui/trusted-interaction';
import { newTabPromptController, newTabTestCard, renderEnabledNewTabRoot } from './new-tab-review/fixtures';
import {
    createSettingsDialog,
    resetSettingsDialogTestEnvironment,
    settingsElement,
    waitForCondition,
} from './helpers/settings-dialog-controller-fixture';

// "Add to deck +" in the lookup popup (and in Study's) runs through the shared
// card-action lifecycle. While its save waits for another Yomu tab's storage
// lease, the learner sees why, in the toast area where save feedback appears.
function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

function statuses(): string[] {
    return [...document.querySelectorAll('.jpdb-reader-toast[role="status"]')].map(node => node.textContent ?? '');
}

function addToDeck(language: InterfaceLanguage, save: () => Promise<void>) {
    const button = document.createElement('button');
    const toast = vi.fn();
    const done = runCardActionOperation(button, save, {
        logger: { warn: () => undefined },
        warning: 'Card action failed',
        action: 'add-default',
        term: '読む',
        language,
        toast,
    }, () => undefined);
    return { button, toast, done };
}

describe('save waiting for another tab', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(async () => {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    it.each(['en', 'ja'] as const)('says so in %s while the save waits, and stops when it proceeds', async language => {
        const waiting = uiText(language, 'saveWaitingForAnotherTab');
        expect(waiting).not.toContain('未翻訳');
        const proceeded = deferred();
        const saved = deferred();
        const action = addToDeck(language, async () => {
            reportSaveWaitingForAnotherTab(true);
            await proceeded.promise;
            reportSaveWaitingForAnotherTab(false);
            await saved.promise;
        });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(statuses()).toEqual([waiting]);
        expect(action.button.disabled).toBe(true);

        proceeded.resolve();
        await vi.advanceTimersByTimeAsync(300);
        expect(statuses()).toEqual([]);
        saved.resolve();
        await action.done;
        expect(action.button.disabled).toBe(false);
    });

    it('clears the status when the save fails while it is still waiting', async () => {
        const action = addToDeck('en', async () => {
            reportSaveWaitingForAnotherTab(true);
            try {
                throw new Error('Timed out waiting for storage lease: local-yomu-srs-deck');
            } finally {
                queueMicrotask(() => reportSaveWaitingForAnotherTab(false));
            }
        });
        await action.done;
        await vi.advanceTimersByTimeAsync(300);
        expect(statuses()).toEqual([]);
        expect(action.toast).toHaveBeenCalledOnce();
    });

    it('shows nothing when no other tab holds the save up', async () => {
        const action = addToDeck('en', async () => undefined);
        await action.done;
        expect(statuses()).toEqual([]);
    });
});

describe('Settings Save waiting for another tab', () => {
    afterEach(() => { resetSettingsDialogTestEnvironment(); });

    it('says so while the save waits, then confirms the save in the dialog', async () => {
        // The dialog fixture reloads the controller's modules: report through the same instance.
        const { reportSaveWaitingForAnotherTab: report } = await import('../../src/reader/app/save-wait');
        const proceeded = deferred();
        const saveSettings = vi.fn(async () => {
            report(true);
            await proceeded.promise;
            report(false);
        });
        const { dependencies, form } = createSettingsDialog({ saveSettings });
        const waiting = uiText('en', 'saveWaitingForAnotherTab');

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => statuses().includes(waiting));
        expect(dependencies.toast).not.toHaveBeenCalled();

        proceeded.resolve();
        await waitForCondition(() => !settingsElement<HTMLButtonElement>(form, 'button[type="submit"]').disabled);
        expect(settingsElement<HTMLElement>(form, '[data-settings-save-status]').textContent).toBe('Settings saved.');
        await vi.waitFor(() => expect(statuses()).toEqual([]));
    });
});

// Study's Library "Add to review" and its grades save to the local deck too.
describe('Study saves waiting for another tab', () => {
    beforeEach(() => { setActiveLearningTargetLanguage('ja'); });
    afterEach(() => {
        vi.restoreAllMocks();
        allowSyntheticReaderInteractionsForTests(true);
        resetActiveLearningTargetLanguage();
        document.body.replaceChildren();
        localStorage.clear();
    });

    /** A save held up by another tab until `proceed`, as the deck's storage lease reports it. */
    function heldUpSave(): { wait: () => Promise<void>; proceed: () => void } {
        const proceeded = deferred();
        return {
            wait: async () => {
                reportSaveWaitingForAnotherTab(true);
                await proceeded.promise;
                reportSaveWaitingForAnotherTab(false);
            },
            proceed: proceeded.resolve,
        };
    }

    it('says so while "Add to review" waits, then reports it as usual', async () => {
        allowSyntheticReaderInteractionsForTests(false);
        const boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);
        const repository = new LocalYomuSrsRepository();
        await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
        const startReview = repository.startReview.bind(repository);
        const heldUp = heldUpSave();
        vi.spyOn(repository, 'startReview').mockImplementation(async cardId => {
            await heldUp.wait();
            return startReview(cardId);
        });
        const toast = vi.fn();
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, learningTargetChosen: true }, {
            srsAdapters: { 'yomu-local': createYomuLocalSrsAdapter(repository) }, toast,
        });
        const probe = controller as unknown as {
            state: typeof DEFAULT_NEW_TAB_UI_STATE;
            browsePool: JPDBCard[];
            srsAdapterBrowsePoolProvider(source: 'yomu-local'): { load(): Promise<JPDBCard[]> };
            bindRootEvents(root: HTMLElement): void;
            renderBrowseResults(root: HTMLElement): void;
        };
        try {
            probe.state = { ...DEFAULT_NEW_TAB_UI_STATE, route: 'search', source: 'yomu-local' };
            probe.browsePool = await probe.srsAdapterBrowsePoolProvider('yomu-local').load();
            const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
            probe.bindRootEvents(root);
            probe.renderBrowseResults(root.querySelector<HTMLElement>('[data-newtab-search-results]')!);
            dispatchAuthorizedReaderControlClick(root.querySelector<HTMLButtonElement>('[data-newtab-action="browse-start-review"]')!);

            await vi.waitFor(() => expect(statuses()).toEqual([uiText('en', 'saveWaitingForAnotherTab')]));
            expect(toast).not.toHaveBeenCalled();
            heldUp.proceed();
            await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('Added to review.'));
            await vi.waitFor(() => expect(statuses()).toEqual([]));
        } finally { controller.destroy(); boundary.abort(); }
    });

    it('says so while a grade waits, and stops when it proceeds', async () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, learningTargetChosen: true });
        const internals = controller as unknown as {
            submitGrade(): Promise<null>;
            submitCurrentGrade(target: { root: HTMLElement; card: JPDBCard }, grade: 'pass', selectedTarget: undefined,
                isCorrection: boolean, reviewOp: { superseded: boolean }, providerContexts: object): Promise<boolean>;
        };
        const heldUp = heldUpSave();
        vi.spyOn(internals, 'submitGrade').mockImplementation(async () => {
            await heldUp.wait();
            return null;
        });
        try {
            // A superseded grade stops right after its save: only the wait is under test.
            const grading = internals.submitCurrentGrade({ root: document.createElement('main'), card: newTabTestCard() },
                'pass', undefined, false, { superseded: true }, {});
            await vi.waitFor(() => expect(statuses()).toEqual([uiText('en', 'saveWaitingForAnotherTab')]));
            heldUp.proceed();
            expect(await grading).toBe(false);
            await vi.waitFor(() => expect(statuses()).toEqual([]));
        } finally { controller.destroy(); }
    });
});
