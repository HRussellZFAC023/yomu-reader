import { currentAccountDataSurfaceIsTrusted } from '../app/account-data-surface';
import { formatUiText, uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { clearCollectionSaveFailure, readCollectionSaveFailure } from '../cards/collection-save-failure';
import { el } from '../dom/builder';
import { newTabAction } from './actions';

/** The failure is never rendered onto an ordinary reading page. */
export async function showCollectionSaveFailure(root: HTMLElement, language: InterfaceLanguage): Promise<void> {
    root.querySelector('[data-collection-failure]')?.remove();
    if (!currentAccountDataSurfaceIsTrusted()) return;
    const failure = await readCollectionSaveFailure().catch(() => null);
    const header = root.querySelector('.jpdb-reader-newtab-topbar');
    if (!failure || !header || !root.isConnected) return;
    header.append(el('aside', { class: 'jpdb-reader-newtab-collection-failure',
        dataset: { collectionFailure: failure.id }, role: 'status' },
    el('strong', {}, formatUiText(language, 'collectFailureTitle', { word: failure.word })),
    el('p', {}, uiText(language, failure.reason)),
    el('p', {}, uiText(language, 'collectFailureHelp')),
    el('button', { type: 'button', dataset: { newtabAction: newTabAction('settings') } }, uiText(language, 'settings')),
    el('button', { type: 'button', dataset: { newtabAction: newTabAction('dismiss-collection-failure') } }, uiText(language, 'collectFailureDismiss')),
    ));
}

export async function dismissCollectionSaveFailure(root: HTMLElement): Promise<void> {
    const notice = root.querySelector<HTMLElement>('[data-collection-failure]');
    const id = notice?.dataset.collectionFailure;
    if (!id || !currentAccountDataSurfaceIsTrusted()) return;
    await clearCollectionSaveFailure(id);
    notice.remove();
}
