import { escapeHtml, readerWordSurfaceText, renderHighlightedTextHtml } from '../dom/index';
import {
    cardHighlightTargets,
    cleanCardHighlightValue,
    compactCardHighlightValue,
    type CardHighlightTarget,
} from './highlight-values';

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
        card.vid !== undefined ? `data-card-highlight-vid="${escapeHtml(String(card.vid))}"` : '',
        card.sid !== undefined ? `data-card-highlight-sid="${escapeHtml(String(card.sid))}"` : '',
    ].filter(Boolean).join(' ');
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
    const cardVid = card.vid === undefined ? '' : String(card.vid);
    const cardSid = card.sid === undefined ? '' : String(card.sid);
    if (cardVid && cardSid && word.dataset.vid === cardVid && word.dataset.sid === cardSid) return true;

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
