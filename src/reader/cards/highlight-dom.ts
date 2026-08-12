import { escapeHtml, readerWordSurfaceText, renderHighlightedTextHtml } from '../dom/index';
import {
    cardHighlightTargets,
    cleanCardHighlightValue,
    compactCardHighlightValue,
    type CardHighlightTarget,
} from './highlight-values';
import { currentAccountDataSurfaceIsTrusted } from '../app/account-data-surface';
import { renderedWordPrivateValue } from '../dom/rendered-word-private-state';

const CARD_HIGHLIGHT_CLASS = 'jpdb-reader-example-target';

export function renderCardHighlightedTextHtml(text: string, card: CardHighlightTarget): string {
    return renderHighlightedTextHtml(text, cardHighlightTargets(card), CARD_HIGHLIGHT_CLASS);
}

export function cardHighlightScopeAttributes(card: CardHighlightTarget | undefined): string {
    if (!card) return '';
    const spelling = cleanCardHighlightValue(card.spelling);
    if (!spelling) return '';
    return [
        `data-card-highlight-spelling="${escapeHtml(spelling)}"`,
        `data-card-highlight-reading="${escapeHtml(cleanCardHighlightValue(card.reading))}"`,
        ...cardHighlightIdentityAttributes(card),
    ].filter(Boolean).join(' ');
}

function cardHighlightIdentityAttributes(card: CardHighlightTarget): string[] {
    if (!currentAccountDataSurfaceIsTrusted()) return [];
    return [
        cardHighlightIdentityAttribute('vid', card.vid),
        cardHighlightIdentityAttribute('sid', card.sid),
    ];
}

function cardHighlightIdentityAttribute(key: 'vid' | 'sid', value: CardHighlightTarget[typeof key]): string {
    return value === undefined ? '' : `data-card-highlight-${key}="${escapeHtml(String(value))}"`;
}

export function highlightCardTargetWords(root: ParentNode, card: CardHighlightTarget): void {
    const words = cardHighlightWords(root);
    for (const word of words) {
        if (isCardHighlightWord(word, card)) word.classList.add(CARD_HIGHLIGHT_CLASS);
    }
}

export function highlightCardTargetScopes(root: ParentNode): void {
    for (const scope of cardHighlightScopes(root)) {
        const card = cardHighlightTargetFromScope(scope);
        if (card) highlightCardTargetWords(scope, card);
    }
}

export function isCardHighlightWord(word: HTMLElement, card: CardHighlightTarget): boolean {
    return cardHighlightIdentityMatches(word, card) || cardHighlightSurfaceMatches(word, card);
}

function cardHighlightIdentityMatches(word: HTMLElement, card: CardHighlightTarget): boolean {
    const identity = cardHighlightIdentity(card);
    if (!identity) return false;
    return renderedWordPrivateValue(word, 'vid') === identity.vid
        && renderedWordPrivateValue(word, 'sid') === identity.sid;
}

function cardHighlightIdentity(card: CardHighlightTarget): { vid: string; sid: string } | null {
    if (card.vid === undefined || card.sid === undefined) return null;
    return { vid: String(card.vid), sid: String(card.sid) };
}

function cardHighlightSurfaceMatches(word: HTMLElement, card: CardHighlightTarget): boolean {
    const surface = compactCardHighlightValue(readerWordSurfaceText(word));
    if (!surface) return false;
    return cardHighlightTargets(card)
        .map(compactCardHighlightValue)
        .filter(Boolean)
        .some(target => surface.includes(target));
}

function cardHighlightWords(root: ParentNode): HTMLElement[] {
    const words = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
    return root instanceof HTMLElement && root.matches('.jpdb-reader-word') ? [root, ...words] : words;
}

function cardHighlightScopes(root: ParentNode): HTMLElement[] {
    const selector = '[data-card-highlight-spelling]';
    const scopes = Array.from(root.querySelectorAll<HTMLElement>(selector));
    return root instanceof HTMLElement && root.matches(selector) ? [root, ...scopes] : scopes;
}

function cardHighlightTargetFromScope(scope: HTMLElement): CardHighlightTarget | null {
    const spelling = cleanCardHighlightValue(scope.dataset.cardHighlightSpelling);
    if (!spelling) return null;
    const reading = cleanCardHighlightValue(scope.dataset.cardHighlightReading);
    return {
        spelling,
        reading,
        vid: scope.dataset.cardHighlightVid,
        sid: scope.dataset.cardHighlightSid,
    };
}
