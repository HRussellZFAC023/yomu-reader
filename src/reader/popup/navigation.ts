import { cardKey } from '../card-utils';
import { escapeHtml } from '../dom';
import { uiText } from '../i18n';
import type { InterfaceLanguage, JPDBCard } from '../types';

export interface CardNavigationEntry {
    card: JPDBCard;
    sentence?: string;
}

export type CardNavigationMode = 'reset' | 'preserve' | 'push-current';

export interface KanjiNavigationEntry extends CardNavigationEntry {
    kanji: string;
}

export type PopupNavigationEntry =
    | (CardNavigationEntry & { kind: 'word' })
    | (KanjiNavigationEntry & { kind: 'kanji' });

export interface ModalNavigationOptions {
    backAction: string;
    backTitle: string;
    label: string;
    controlsHtml?: string;
}

export class PopupNavigationController {
    private wordStack: PopupNavigationEntry[] = [];
    private currentWord?: CardNavigationEntry;
    private kanjiStack: KanjiNavigationEntry[] = [];
    private currentKanji?: KanjiNavigationEntry;

    constructor(private readonly hasActiveKanjiPopover: () => boolean) {}

    updateWord(card: JPDBCard, sentence: string | undefined, trigger: 'modal' | 'hover', mode: CardNavigationMode, previousNavigationEntry?: PopupNavigationEntry): void {
        if (trigger !== 'modal') {
            this.clearWord();
            return;
        }

        const next: CardNavigationEntry = { card, sentence };
        if (mode === 'reset') this.wordStack = [];
        else this.pushPreviousWord(mode, next, previousNavigationEntry);
        this.currentWord = next;
    }

    updateKanji(card: JPDBCard, kanji: string, sentence: string | undefined, mode: CardNavigationMode): void {
        const next: KanjiNavigationEntry = { card, kanji, sentence };
        if (mode === 'reset') {
            this.kanjiStack = [];
            this.currentKanji = next;
            return;
        }

        const previous = this.previousKanjiToPush(mode, next);
        if (previous) this.pushDistinctKanjiEntry(previous);
        this.currentKanji = next;
    }

    clearWord(): void {
        this.wordStack = [];
        this.currentWord = undefined;
    }

    clearKanji(): void {
        this.kanjiStack = [];
        this.currentKanji = undefined;
    }

    activeKanjiEntry(): PopupNavigationEntry | undefined {
        if (!this.currentKanji || !this.hasActiveKanjiPopover()) return undefined;
        return this.kanjiEntry(this.currentKanji);
    }

    activeWordEntry(): PopupNavigationEntry | undefined {
        return this.currentWord ? this.wordEntry(this.currentWord) : undefined;
    }

    popPreviousWord(): PopupNavigationEntry | undefined {
        return this.wordStack.pop();
    }

    popPreviousKanji(): KanjiNavigationEntry | undefined {
        return this.kanjiStack.pop();
    }

    renderWordHistory(language: InterfaceLanguage, trigger: 'modal' | 'hover'): string {
        if (trigger !== 'modal') return '';
        const previous = this.wordStack[this.wordStack.length - 1];
        if (!previous) return '';
        return renderModalNavigation({
            backAction: 'word-history-back',
            backTitle: previous.kind === 'kanji'
                ? `${uiText(language, 'backToKanji')}: ${previous.kanji}`
                : `${uiText(language, 'backToWord')}: ${previous.card.spelling}`,
            label: previous.kind === 'kanji' ? previous.kanji : previous.card.spelling,
        });
    }

    kanjiModalBack(card: JPDBCard, language: InterfaceLanguage): { backAction: string; backTitle: string; label: string } {
        const previousKanji = this.kanjiStack[this.kanjiStack.length - 1];
        return previousKanji
            ? {
                backAction: 'kanji-history-back',
                backTitle: `${uiText(language, 'backToKanji')}: ${previousKanji.kanji}`,
                label: previousKanji.kanji,
            }
            : {
                backAction: 'word-back',
                backTitle: `${uiText(language, 'backToWord')}: ${card.spelling}`,
                label: card.spelling,
            };
    }

    private pushPreviousWord(mode: CardNavigationMode, next: CardNavigationEntry, previousNavigationEntry?: PopupNavigationEntry): void {
        const previous = previousNavigationEntry ?? this.previousWordEntry(next);
        if (!this.shouldPushPreviousWord(mode, previous, next)) return;
        this.pushDistinctWordEntry(previous);
    }

    private shouldPushPreviousWord(mode: CardNavigationMode, previous: PopupNavigationEntry | undefined, next: CardNavigationEntry): previous is PopupNavigationEntry {
        if (mode !== 'push-current') return false;
        if (!previous) return false;
        return !this.isSameEntryAsWord(previous, next);
    }

    private pushDistinctWordEntry(previous: PopupNavigationEntry): void {
        const lastStackEntry = this.wordStack[this.wordStack.length - 1];
        if (!lastStackEntry || !this.isSamePopupEntry(lastStackEntry, previous)) this.wordStack.push(previous);
    }

    private previousWordEntry(next: CardNavigationEntry): PopupNavigationEntry | undefined {
        return this.currentWord && !this.isSameCard(this.currentWord, next)
            ? this.wordEntry(this.currentWord)
            : undefined;
    }

    private previousKanjiToPush(mode: CardNavigationMode, next: KanjiNavigationEntry): KanjiNavigationEntry | undefined {
        const current = this.currentKanji;
        if (mode !== 'push-current') return undefined;
        if (!current) return undefined;
        return this.isSameKanji(current, next) ? undefined : current;
    }

    private pushDistinctKanjiEntry(entry: KanjiNavigationEntry): void {
        const lastStackEntry = this.kanjiStack[this.kanjiStack.length - 1];
        if (!lastStackEntry || !this.isSameKanji(lastStackEntry, entry)) this.kanjiStack.push(entry);
    }

    private wordEntry(entry: CardNavigationEntry): PopupNavigationEntry {
        return { kind: 'word', card: entry.card, sentence: entry.sentence };
    }

    private kanjiEntry(entry: KanjiNavigationEntry): PopupNavigationEntry {
        return { kind: 'kanji', card: entry.card, sentence: entry.sentence, kanji: entry.kanji };
    }

    private isSameCard(first: CardNavigationEntry, second: CardNavigationEntry): boolean {
        return cardKey(first.card) === cardKey(second.card);
    }

    private isSameKanji(first: KanjiNavigationEntry, second: KanjiNavigationEntry): boolean {
        return this.isSameCard(first, second) && first.kanji === second.kanji;
    }

    private isSameEntryAsWord(entry: PopupNavigationEntry, word: CardNavigationEntry): boolean {
        return entry.kind === 'word' && this.isSameCard(entry, word);
    }

    private isSamePopupEntry(first: PopupNavigationEntry, second: PopupNavigationEntry): boolean {
        if (first.kind !== second.kind) return false;
        if (first.kind === 'kanji' && second.kind === 'kanji') return this.isSameKanji(first, second);
        return this.isSameCard(first, second);
    }
}

export function renderModalNavigation(options: ModalNavigationOptions): string {
    return `
        <div class="jpdb-reader-modal-nav">
            <button class="jpdb-reader-icon-mini" type="button" data-action="${escapeHtml(options.backAction)}" title="${escapeHtml(options.backTitle)}" aria-label="${escapeHtml(options.backTitle)}">←</button>
            <span title="${escapeHtml(options.label)}">${escapeHtml(options.label)}</span>
            ${options.controlsHtml ?? ''}
        </div>
    `;
}
