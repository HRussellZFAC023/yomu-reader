import { uiText } from '../app/i18n';
import { watchSavesWaitingForAnotherTab } from '../app/save-wait';
import type { InterfaceLanguage } from '../app/types';
import { holdReaderToast } from './toast';

/**
 * Runs a learner's save. While it waits for another Yomu tab to finish saving,
 * a status says so where save feedback appears; the status leaves as soon as
 * the save proceeds, and in any case when it succeeds or fails.
 */
export async function withSaveWaitStatus<T>(language: InterfaceLanguage, save: () => Promise<T>): Promise<T> {
    let release: (() => void) | undefined;
    const stopWatching = watchSavesWaitingForAnotherTab(waiting => {
        if (waiting) {
            release ??= holdReaderToast(uiText(language, 'saveWaitingForAnotherTab'));
            return;
        }
        release?.();
        release = undefined;
    });
    try {
        return await save();
    } finally {
        stopWatching();
        release?.();
    }
}
