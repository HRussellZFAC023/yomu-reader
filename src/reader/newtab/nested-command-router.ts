import type { JPDBCard } from '../app/types';
import { togglePopoverReviewTargetSelection } from '../cards/popover-renderer';
import {
    dispatchPrivateCommand,
    type CardCommandCapability,
} from '../dom/private-command-capabilities';
import { targetCanLookupCharacter, usesJapaneseCharacterStudy } from '../languages/character-lookup';
import { openDeckPickerForCardAdd } from '../study/mining-controls';
import { sentenceForCard } from './study-queue';

type PerformCardAction = (
    button: HTMLButtonElement,
    card: JPDBCard,
    sentence?: string,
    anchor?: HTMLElement,
    command?: CardCommandCapability,
) => Promise<void> | void;

export interface NestedCommandRouterContext {
    route(): string;
    currentCard(): JPDBCard | undefined;
    selectSearch(root: HTMLElement, query: string): void;
    showKanji(card: JPDBCard, kanji: string, anchor: HTMLElement): void;
    showTerm(anchor: HTMLElement, expression: string, reading: string): void;
    loadJitenWords(button: HTMLButtonElement, action: 'filter' | 'more'): void;
    playJpdbExampleAudio?: (audioIds: string, fallbackSentence: string) => Promise<void> | void;
    cardForTarget(target: HTMLElement): JPDBCard | undefined;
    performCardAction?: PerformCardAction;
}

/** Routes only privately-bound commands emitted by nested New Tab cards. */
export class NestedCommandRouter {
    constructor(private readonly context: NestedCommandRouterContext) {}

    handle(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        return dispatchPrivateCommand(target, {
            'kanji-lookup': command => { this.handleKanji(root, target, event, command.kanji); },
            'kanji-word': command => { this.handleTerm(root, target, event, command.expression, command.reading); },
            'jiten-kanji-words': command => { this.handleJiten(target, event, command.action, command.character); },
            'card-action': command => { this.handleCard(target, event, command); },
            'card-ui': command => { this.handleCardUi(target, event, command.action); },
        });
    }

    private handleKanji(root: HTMLElement, target: HTMLElement, event: MouseEvent, kanji: string): void {
        consumeNestedCommandEvent(event);
        if (!usesJapaneseCharacterStudy()) return;
        if (this.context.route() === 'search') {
            this.context.selectSearch(root, kanji);
            return;
        }
        const card = this.context.currentCard();
        if (card) this.context.showKanji(card, kanji, target);
    }

    private handleTerm(root: HTMLElement, target: HTMLElement, event: MouseEvent, expression: string, reading: string): void {
        consumeNestedCommandEvent(event);
        if (this.context.route() === 'search') {
            this.context.selectSearch(root, expression);
            return;
        }
        this.context.showTerm(target, expression, reading);
    }

    private handleJiten(target: HTMLElement, event: MouseEvent, action: 'filter' | 'more', character: string): void {
        const button = nestedCommandButton(target);
        if (!button) return;
        consumeNestedCommandEvent(event);
        if (targetCanLookupCharacter(character)) this.context.loadJitenWords(button, action);
    }

    private handleCard(target: HTMLElement, event: MouseEvent, command: CardCommandCapability): void {
        if (command.action === 'jpdb-example-audio') {
            this.handleJpdbExampleAudio(event, command);
            return;
        }
        this.performNestedCardAction(target, event, command);
    }

    private handleJpdbExampleAudio(event: MouseEvent, command: CardCommandCapability): void {
        consumeNestedCommandEvent(event);
        this.playJpdbExampleAudio(command);
    }

    private performNestedCardAction(target: HTMLElement, event: MouseEvent, command: CardCommandCapability): void {
        const button = nestedCommandButton(target);
        if (!button) return;
        const card = this.context.cardForTarget(target);
        const perform = this.context.performCardAction;
        if (!card || !perform) return;
        consumeNestedCommandEvent(event);
        void perform(button, card, nestedCardSentence(command, card), button, command);
    }

    private playJpdbExampleAudio(command: CardCommandCapability): void {
        const play = this.context.playJpdbExampleAudio;
        if (!play) return;
        void play(command.audioIds ?? '', command.sentence ?? '');
    }

    private handleCardUi(target: HTMLElement, event: MouseEvent, action: 'deck-picker' | 'mining-collapse' | 'review-target-toggle'): void {
        const button = nestedCommandButton(target);
        if (!button) return;
        if (action === 'review-target-toggle') {
            consumeNestedCommandEvent(event);
            togglePopoverReviewTargetSelection(button);
            return;
        }
        if (action === 'deck-picker') this.openDeckPicker(button, target, event);
    }

    private openDeckPicker(button: HTMLButtonElement, target: HTMLElement, event: MouseEvent): void {
        const card = this.context.cardForTarget(target);
        const perform = this.context.performCardAction;
        if (!card || !perform) return;
        consumeNestedCommandEvent(event);
        openDeckPickerForCardAdd(button, card, sentenceForCard(card), (actionButton, actionCard, actionSentence, command) => (
            perform(actionButton, actionCard, actionSentence, actionButton, command)
        ));
    }
}

function nestedCommandButton(target: HTMLElement): HTMLButtonElement | null {
    return target instanceof HTMLButtonElement ? target : target.closest<HTMLButtonElement>('button');
}

function nestedCardSentence(command: CardCommandCapability, card: JPDBCard): string {
    return command.sentence || sentenceForCard(card);
}

function consumeNestedCommandEvent(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
}
