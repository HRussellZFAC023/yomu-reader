import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uiText } from '../../src/reader/app/i18n';
import { reportSaveWaitingForAnotherTab } from '../../src/reader/app/save-wait';
import type { InterfaceLanguage } from '../../src/reader/app/types';
import { runCardActionOperation } from '../../src/reader/cards/action-operation';
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

    it('says so while the save waits, then reports the save as usual', async () => {
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
        await waitForCondition(() => dependencies.toast.mock.calls.length > 0);
        expect(dependencies.toast).toHaveBeenCalledWith('Settings saved.');
        await waitForCondition(() => !settingsElement<HTMLButtonElement>(form, 'button[type="submit"]').disabled);
        await vi.waitFor(() => expect(statuses()).toEqual([]));
    });
});
