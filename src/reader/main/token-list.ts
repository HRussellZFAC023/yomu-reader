import { escapeHtml } from '../dom';
import { uiText } from '../i18n';
import { renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from '../popup-navigation';
import type { InterfaceLanguage, JPDBToken } from '../types';
import type { TokenListSource } from '../reader-main-helpers';

export type TokenListContext = {
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    previousNavigationEntry?: PopupNavigationEntry;
    stackOverSettings?: boolean;
};

export type TokenListHandlerCallbacks = {
    showPrevious(anchor: HTMLElement | undefined, context: TokenListContext): void;
    showCard(button: HTMLButtonElement, tokens: JPDBToken[], anchor: HTMLElement | undefined, context: TokenListContext): void;
};

export function renderTokenListHtml(
    tokens: JPDBToken[],
    selected: string,
    source: TokenListSource,
    previousNavigationEntry: PopupNavigationEntry | undefined,
    language: InterfaceLanguage,
): string {
    const title = uiText(language, source === 'selection' ? 'selection' : 'search');
    return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body">
                ${renderTokenListNavigation(previousNavigationEntry, language)}
                <div class="jpdb-reader-pos">${escapeHtml(title)}</div>
                <div class="jpdb-reader-meanings">
                    ${tokens.map(token => renderTokenListButton(token)).join('')}
                </div>
                <div class="jpdb-reader-help">${escapeHtml(uiText(language, 'parsedFrom'))}: ${escapeHtml(selected)}</div>
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
        const backButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="token-list-back"]');
        if (backButton) {
            event.preventDefault();
            event.stopPropagation();
            callbacks.showPrevious(anchor, context);
            return;
        }
        const button = (event.target as HTMLElement).closest('button[data-vid]') as HTMLButtonElement | null;
        if (!button) return;
        callbacks.showCard(button, tokens, anchor, context);
    });
}

function renderTokenListNavigation(previousNavigationEntry: PopupNavigationEntry | undefined, language: InterfaceLanguage): string {
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
            <button class="jpdb-reader-btn" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                ${escapeHtml(token.card.spelling)} ${renderTokenListReading(token)}
            </button>
        `;
}

function renderTokenListReading(token: JPDBToken): string {
    return token.card.reading !== token.card.spelling
        ? `<span class="jpdb-reader-reading">${escapeHtml(token.card.reading)}</span>`
        : '';
}
