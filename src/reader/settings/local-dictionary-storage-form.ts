import { uiText } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import { escapeHtml } from '../dom/index';
import { checkbox } from './form-controls';
import { settingsText } from './settings-text';

const SITE_CLEAR_BLOCKED_DICTIONARY_ACTIONS = new Set([
    'import-yomitan-dictionary',
    'download-recommended-dictionary',
]);

export function dictionaryActionBlockedDuringSiteClear(action: string, clearPending: boolean): boolean {
    return clearPending && SITE_CLEAR_BLOCKED_DICTIONARY_ACTIONS.has(action);
}

export function renderLocalDictionaryStorageControls(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
                <div class="jpdb-reader-settings-subsection" data-local-dictionary-storage>
                    ${checkbox('localDictionariesEnabled', text('localDictionariesEnabled'), settings.localDictionariesEnabled)}
                    <div class="jpdb-reader-help" data-help-key="localDictionarySiteStorageHelp">${escapeHtml(uiText(language, 'localDictionarySiteStorageHelp'))}</div>
                    <div class="jpdb-reader-help-actions">
                        <button class="jpdb-reader-btn jpdb-reader-help-reset" type="button" data-action="clear-local-dictionary-site-storage">${escapeHtml(uiText(language, 'clearLocalDictionarySiteStorage'))}</button>
                    </div>
                </div>`;
}
