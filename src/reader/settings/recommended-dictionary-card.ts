import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { userFacingCopyKeyOf, userFacingErrorText } from '../app/user-facing-errors';
import { dictionaryInstallFailureText } from '../dictionaries/install-failure';
import {
    findRecommendedDictionary,
    recommendedDictionaryImportOptions,
    type RecommendedDictionary,
} from '../dictionaries/recommended';
import type { ImportSummary, YomitanDictionaryStore } from '../dictionaries/yomitan';
import { recommendedDictionaryFilename } from './file-io';

/**
 * A recommended dictionary card in Settings → Sources: its Install/Update
 * button and the status line under it, while an install is queued, running or
 * has failed. A failed card keeps its reason until the learner clicks again.
 */
export type RecommendedDictionaryInstallState = 'queued' | 'installing' | 'failed';

export interface RecommendedDictionaryOperationState {
    state: RecommendedDictionaryInstallState;
    message: string;
}

export function recommendedDictionaryForControl(control: HTMLElement | null | undefined): RecommendedDictionary {
    const dictionary = control?.dataset.dictionaryId ? findRecommendedDictionary(control.dataset.dictionaryId) : undefined;
    if (!dictionary) throw new Error('Recommended dictionary not found.');
    return dictionary;
}

export function recommendedDictionaryDownloadStatus(control: HTMLElement | null | undefined, dictionaryName: string, language: InterfaceLanguage): string {
    const action = control?.dataset.installed === 'true' ? uiText(language, 'update') : uiText(language, 'dictionaryDownloading');
    return `${dictionaryName}: ${action}...`;
}

export function syncRecommendedDictionaryCards(
    form: HTMLFormElement,
    operations: ReadonlyMap<string, RecommendedDictionaryOperationState>,
    language: InterfaceLanguage,
): void {
    form.querySelectorAll<HTMLButtonElement>('[data-action="download-recommended-dictionary"]').forEach(button => {
        const operation = operations.get(button.dataset.dictionaryId ?? '');
        syncRecommendedDictionaryStatus(button, operation);
        if (operation && operation.state !== 'failed') showRecommendedDictionaryBusy(button, operation, language);
        else showRecommendedDictionaryAction(button, language);
    });
}

/** Install or Update, ready to click. */
function showRecommendedDictionaryAction(button: HTMLButtonElement, language: InterfaceLanguage): void {
    delete button.dataset.importState;
    delete button.dataset.importMessage;
    button.disabled = false;
    button.removeAttribute('disabled');
    const label = uiText(language, button.dataset.installed === 'true' ? 'update' : 'install');
    button.replaceChildren(label);
    button.title = label;
    button.setAttribute('aria-label', label);
}

function showRecommendedDictionaryBusy(button: HTMLButtonElement, operation: RecommendedDictionaryOperationState, language: InterfaceLanguage): void {
    const label = uiText(language, operation.state === 'installing' ? 'installing' : 'queued');
    button.disabled = true;
    button.dataset.importState = operation.state;
    button.dataset.importMessage = operation.message;
    button.replaceChildren(label);
    button.title = operation.message;
    button.setAttribute('aria-label', operation.message);
}

function syncRecommendedDictionaryStatus(button: HTMLButtonElement, operation: RecommendedDictionaryOperationState | undefined): void {
    const status = button.closest<HTMLElement>('.jpdb-reader-recommended-item')
        ?.querySelector<HTMLElement>('[data-recommended-dictionary-status]');
    if (!status) return;
    status.hidden = !operation;
    if (operation) {
        status.textContent = operation.message;
        status.dataset.importState = operation.state;
    } else {
        status.textContent = '';
        delete status.dataset.importState;
    }
}

export async function importRecommendedDictionary(
    dictionaries: Pick<YomitanDictionaryStore, 'importFromUrl'>,
    dictionary: RecommendedDictionary,
    setStatus: (message: string) => void,
): Promise<ImportSummary> {
    const downloadUrl = dictionary.downloadUrl ?? '';
    const importOptions = recommendedDictionaryImportOptions(dictionary);
    return importOptions
        ? await dictionaries.importFromUrl(downloadUrl, recommendedDictionaryFilename(dictionary), setStatus, importOptions)
        : await dictionaries.importFromUrl(downloadUrl, recommendedDictionaryFilename(dictionary), setStatus);
}

export function recommendedDictionaryFailureText(language: InterfaceLanguage, error: unknown): string {
    if (!shouldPromptManualDictionaryDownload(error)) return dictionaryInstallFailureText(language, error);
    return `${userFacingErrorText(language, 'dictionaryDownloadBlocked', error)} ${uiText(language, 'dictionaryManualDownloadHint')}`;
}

/**
 * Whether to offer "import the ZIP by hand" instead of failing outright.
 *
 * This used to substring-match `error.message` against fifteen hints such as
 * 'blocked in this browser' and 'request bridge'. Not one of the five real
 * strings contains any of them -- the copy says 'Download blocked.' and
 * 'Download needs bridge; else import ZIP.' -- so the matcher always returned
 * false and the manual-import recovery, written for exactly the case where a
 * userscript manager refuses the request, could never reach anyone (GitHub #39).
 *
 * Matching rendered COPY is the defect: it is localized, it gets shortened for
 * width, and neither change touches this file. The copy KEY is stable, so that
 * is what this reads.
 */
function shouldPromptManualDictionaryDownload(error: unknown): boolean {
    const copyKey = userFacingCopyKeyOf(error);
    return copyKey === 'dictionaryDownloadBlocked' || copyKey === 'dictionaryDownloadNeedsBridge';
}
