import { escapeHtml, readerWordClassName, renderRuby, shouldRenderRuby } from '../dom/index';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import { normalizeCardStates, primaryCardState } from '../cards/state';
import { uiText } from '../app/i18n';
import { renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from '../popup/navigation';
import { renderSelectionLookupPills } from '../sources/word-pills';
import type { JPDBToken, ReaderSettings } from '../app/types';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

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
    previousNavigationEntry: PopupNavigationEntry | undefined,
    settings: ReaderSettings,
): string {
    const language = settings.interfaceLanguage;
    const title = uiText(language, 'search');
    return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body" data-token-list-selected="${escapeHtml(selected)}">
                ${renderTokenListNavigation(previousNavigationEntry, language)}
                <div class="jpdb-reader-pos">${escapeHtml(title)}</div>
                ${renderSelectionLookupPills(selected, settings)}
                ${renderTokenSentence(tokens, selected, settings)}
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
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-token-choice]');
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

type TokenSentenceSegment =
    | { kind: 'text'; text: string }
    | { kind: 'token'; token: JPDBToken; surface: string };

// The selection/search popover shows the parsed text as a flowing sentence:
// every token stays inline (annotated like a page word) and the text between
// tokens — numbers, latin, punctuation — is preserved as plain gap text.
function renderTokenSentence(tokens: JPDBToken[], selected: string, settings: ReaderSettings): string {
    const { segments, unmatched } = tokenSentenceSegments(tokens, selected);
    const flow = segments.map(segment => segment.kind === 'token'
        ? renderTokenSentenceWord(segment.token, segment.surface, settings)
        : `<span class="jpdb-reader-token-sentence-gap">${escapeHtml(segment.text)}</span>`).join('');
    const extras = unmatched.map(token => renderTokenSentenceWord(token, token.card.spelling, settings)).join(' ');
    return `<div class="jpdb-reader-meanings jpdb-reader-token-sentence" lang="ja">${flow}${extras ? `<span class="jpdb-reader-token-sentence-extras"> ${extras}</span>` : ''}</div>`;
}

// Token offsets are not guaranteed to index into `selected` (they can be
// relative to the surrounding sentence the parser saw), so each token is
// re-anchored: exact offset slice first, then a text search for its spelling
// or reading, then a loose offset check for conjugated surfaces. Tokens that
// cannot be anchored are appended after the sentence instead of being dropped.
function tokenSentenceSegments(tokens: JPDBToken[], selected: string): { segments: TokenSentenceSegment[]; unmatched: JPDBToken[] } {
    const segments: TokenSentenceSegment[] = [];
    const unmatched: JPDBToken[] = [];
    let cursor = 0;
    for (const token of tokens) {
        const match = matchTokenSurface(selected, cursor, token);
        if (!match) {
            unmatched.push(token);
            continue;
        }
        if (match.start > cursor) segments.push({ kind: 'text', text: selected.slice(cursor, match.start) });
        segments.push({ kind: 'token', token, surface: selected.slice(match.start, match.end) });
        cursor = match.end;
    }
    if (cursor < selected.length) segments.push({ kind: 'text', text: selected.slice(cursor) });
    return { segments, unmatched };
}

function matchTokenSurface(selected: string, cursor: number, token: JPDBToken): { start: number; end: number } | null {
    if (hasPlausibleTokenOffsets(selected, cursor, token)) {
        const slice = selected.slice(token.start, token.end);
        if (slice === token.card.spelling || slice === token.card.reading) return { start: token.start, end: token.end };
    }
    for (const needle of [token.card.spelling, token.card.reading]) {
        const trimmed = needle?.trim();
        if (!trimmed) continue;
        const index = selected.indexOf(trimmed, cursor);
        if (index >= 0) return { start: index, end: index + trimmed.length };
    }
    if (hasPlausibleTokenOffsets(selected, cursor, token) && sliceSharesTokenPrefix(selected, token)) {
        return { start: token.start, end: token.end };
    }
    return null;
}

function hasPlausibleTokenOffsets(selected: string, cursor: number, token: JPDBToken): boolean {
    return token.start >= cursor && token.end > token.start && token.end <= selected.length;
}

// Conjugated surfaces (食べた for 食べる) never equal the dictionary form, so
// accept the token's own offsets when the slice shares its leading character.
function sliceSharesTokenPrefix(selected: string, token: JPDBToken): boolean {
    const first = selected.slice(token.start, token.end)[0];
    return Boolean(first && (token.card.spelling.startsWith(first) || token.card.reading.startsWith(first)));
}

function renderTokenSentenceWord(token: JPDBToken, surface: string, settings: ReaderSettings): string {
    const reading = tokenSentenceReading(token);
    const pitchClass = tokenSentencePitchClass(token, reading, surface);
    const chipToken: JPDBToken = { ...token, pitchClass, start: 0, end: surface.length, length: surface.length, rubies: [] };
    const state = primaryCardState(normalizeCardStates(token.card.cardState));
    const withRuby = shouldRenderRuby(surface, chipToken, settings);
    const classes = tokenSentenceWordClasses(state, chipToken, settings, withRuby);
    const content = tokenSentenceWordContent(surface, chipToken, withRuby);
    return `<button type="button" class="${classes}" data-token-choice="true"${privateCommandAttributes({ kind: 'token-choice', vid: token.card.vid, sid: token.card.sid })} data-surface="${escapeHtml(surface)}" data-expression="${escapeHtml(token.card.spelling)}"${tokenSentenceReadingAttribute(reading)} data-pitch-class="${escapeHtml(pitchClass || 'unknown')}">${content}</button>`;
}

function tokenSentenceReading(token: JPDBToken): string {
    return token.card.reading ? token.card.reading.trim() : '';
}

function tokenSentencePitchClass(token: JPDBToken, reading: string, surface: string): string {
    if (token.pitchClass) return token.pitchClass;
    return getPitchClass(token.card.pitchAccent ?? [], reading || surface);
}

function tokenSentenceWordClasses(
    state: ReturnType<typeof primaryCardState>,
    token: JPDBToken,
    settings: ReaderSettings,
    withRuby: boolean,
): string {
    return [
        readerWordClassName(state, token, settings),
        'jpdb-reader-token-sentence-word',
        withRuby ? 'jpdb-reader-has-furi' : '',
    ].filter(Boolean).join(' ');
}

function tokenSentenceWordContent(surface: string, token: JPDBToken, withRuby: boolean): string {
    return withRuby ? renderRuby(surface, token) : escapeHtml(surface);
}

function tokenSentenceReadingAttribute(reading: string): string {
    return reading ? ` data-reading="${escapeHtml(reading)}"` : '';
}
