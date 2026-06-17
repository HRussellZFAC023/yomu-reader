import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from '../popup/navigation';
import { renderSelectionLookupPills } from '../sources/word-pills';
import type { JPDBToken, ReaderSettings } from '../app/types';
import type { TokenListSource } from '../app/main-helpers';

export type TokenListContext = {
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    previousNavigationEntry?: PopupNavigationEntry;
    stackOverSettings?: boolean;
};

export type TokenListHandlerCallbacks = {
    showPrevious(anchor: HTMLElement | undefined, context: TokenListContext): void;
    showCard(button: HTMLButtonElement, tokens: JPDBToken[], anchor: HTMLElement | undefined, context: TokenListContext): void;
    copySelected(selected: string): void;
};

export function renderTokenListHtml(
    tokens: JPDBToken[],
    selected: string,
    source: TokenListSource,
    previousNavigationEntry: PopupNavigationEntry | undefined,
    settings: ReaderSettings,
): string {
    const language = settings.interfaceLanguage;
    const title = uiText(language, source === 'selection' ? 'selection' : 'search');
    return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body" data-token-list-selected="${escapeHtml(selected)}">
                ${renderTokenListNavigation(previousNavigationEntry, language)}
                <div class="jpdb-reader-pos">${escapeHtml(title)}</div>
                ${renderSelectionLookupPills(selected, settings)}
                <div class="jpdb-reader-meanings">
                    ${tokens.map(token => renderTokenListButton(token)).join('')}
                </div>
                ${source === 'selection' ? renderTokenListTranslation(tokens, settings) : ''}
            </div>
        `;
}

export function installTokenListHandlers(
    popover: HTMLElement,
    tokens: JPDBToken[],
    anchor: HTMLElement | undefined,
    context: TokenListContext,
    callbacks: TokenListHandlerCallbacks,
): void {
    popover.addEventListener('click', event => {
        const selectionCopyButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="copy-selection"]');
        if (selectionCopyButton) {
            event.preventDefault();
            event.stopPropagation();
            callbacks.copySelected(tokenListSelectedText(popover));
            return;
        }
        const backButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="token-list-back"]');
        if (backButton) {
            event.preventDefault();
            event.stopPropagation();
            callbacks.showPrevious(anchor, context);
            return;
        }
        const button = (event.target as HTMLElement).closest('button[data-token-choice][data-vid]') as HTMLButtonElement | null;
        if (!button) return;
        callbacks.showCard(button, tokens, anchor, context);
    });
}

function tokenListSelectedText(popover: HTMLElement): string {
    return popover.querySelector<HTMLElement>('[data-token-list-selected]')?.dataset.tokenListSelected ?? '';
}

function renderTokenListNavigation(previousNavigationEntry: PopupNavigationEntry | undefined, language: ReaderSettings['interfaceLanguage']): string {
    if (!previousNavigationEntry) return '';
    return renderModalNavigation({
        backAction: 'token-list-back',
        backTitle: previousNavigationEntry.kind === 'kanji'
            ? `${uiText(language, 'backToKanji')}: ${previousNavigationEntry.kanji}`
            : `${uiText(language, 'backToWord')}: ${previousNavigationEntry.card.spelling}`,
        label: previousNavigationEntry.kind === 'kanji'
            ? previousNavigationEntry.kanji
            : previousNavigationEntry.card.spelling,
    });
}

function renderTokenListButton(token: JPDBToken): string {
    return `
            <button class="jpdb-reader-btn" data-token-choice="true" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                ${escapeHtml(token.card.spelling)} ${renderTokenListReading(token)}
            </button>
        `;
}

function renderTokenListReading(token: JPDBToken): string {
    return token.card.reading !== token.card.spelling
        ? `<span class="jpdb-reader-reading">${escapeHtml(token.card.reading)}</span>`
        : '';
}

function renderTokenListTranslation(tokens: JPDBToken[], settings: ReaderSettings): string {
    if (!settings.selectionPopoverShowTranslation) return '';
    const glosses = tokens
        .map(token => token.card.meanings.flatMap(meaning => meaning.glosses).filter(Boolean).slice(0, 2).join(', '))
        .filter(Boolean);
    if (!glosses.length) return '';
    return `<div class="jpdb-reader-help jpdb-reader-selection-translation">${escapeHtml(glosses.join(' / '))}</div>`;
}
