import { currentAccountDataSurfaceIsTrusted } from '../app/account-data-surface';
import type { JPDBCard } from '../app/types';
import { createPrivateElementStateSlot, remintPrivateElementStateTokens } from './private-element-state';

export interface RenderedWordPrivateState {
    vid?: string;
    sid?: string;
    cardSource?: string;
    cardId?: string;
    readingIndex?: string;
    cardState?: string;
    stateProvenance?: string;
    srsProvider?: string;
    bunproState?: string;
    bunproPrefillState?: string;
    bunproPrefillProvenance?: string;
    ankiState?: string;
    ankiDecks?: string;
}

type RenderedWordPrivateKey = keyof RenderedWordPrivateState;

const privateStateSlot = createPrivateElementStateSlot<RenderedWordPrivateState>(
    state => Object.freeze({ ...state }),
    { replayable: true },
);
const DATASET_KEYS: Record<RenderedWordPrivateKey, keyof DOMStringMap> = {
    vid: 'vid',
    sid: 'sid',
    cardSource: 'cardSource',
    cardId: 'cardId',
    readingIndex: 'readingIndex',
    cardState: 'cardState',
    stateProvenance: 'stateProvenance',
    srsProvider: 'srsProvider',
    bunproState: 'bunproState',
    bunproPrefillState: 'bunproPrefillState',
    bunproPrefillProvenance: 'bunproPrefillProvenance',
    ankiState: 'ankiState',
    ankiDecks: 'ankiDecks',
};

export function renderedWordPrivateStateForCard(card: JPDBCard, state: string): RenderedWordPrivateState {
    const source = renderedWordCardSource(card);
    return {
        vid: String(card.vid),
        sid: String(card.sid),
        cardSource: source,
        cardId: String(renderedWordProviderNumber(source, card.jitenWordId, card.vid)),
        readingIndex: String(renderedWordProviderNumber(source, card.jitenReadingIndex, card.sid)),
        cardState: state,
        stateProvenance: renderedWordStateProvenance(card),
    };
}

function renderedWordCardSource(card: JPDBCard): NonNullable<JPDBCard['source']> {
    if (card.source) return card.source;
    return card.reviewSource === 'jiten-api' ? 'jiten' : 'jpdb';
}

function renderedWordProviderNumber(source: string, jitenValue: number | undefined, fallback: number): number {
    if (source !== 'jiten') return fallback;
    return jitenValue ?? fallback;
}

function renderedWordStateProvenance(card: JPDBCard): string {
    return card.provisionalState === true ? 'provisional' : 'authoritative';
}

/** Registers identity before an HTML string is parsed into an Element. */
export function renderedWordPrivateAttributes(card: JPDBCard, state: string): string {
    return renderedWordPrivateAttributesForState(renderedWordPrivateStateForCard(card, state));
}

export function renderedWordPrivateAttributesForState(privateState: RenderedWordPrivateState): string {
    const trustedAttributes = currentAccountDataSurfaceIsTrusted()
        ? Object.entries(privateState)
            .map(([key, value]) => ` data-${datasetAttributeName(DATASET_KEYS[key as RenderedWordPrivateKey])}="${escapeAttributeValue(String(value))}"`)
            .join('')
        : '';
    return ` data-yomu-word="true"${privateStateSlot.attributes(privateState)}${trustedAttributes}`;
}

/** Mints one-use private identity tokens for reader-owned cached word HTML. */
export function remintRenderedWordPrivateTokens(html: string): string {
    return remintPrivateElementStateTokens(html);
}

export function registerRenderedWordPrivateState(word: HTMLElement, state: RenderedWordPrivateState): void {
    privateStateSlot.bind(word, state);
    word.dataset.yomuWord = 'true';
    projectPrivateState(word, state);
}

export function updateRenderedWordPrivateState(word: HTMLElement, patch: Partial<RenderedWordPrivateState>): void {
    const current = { ...(privateStateSlot.read(word) ?? {}) };
    for (const key of Object.keys(patch) as RenderedWordPrivateKey[]) {
        const value = patch[key];
        if (value === undefined) delete current[key];
        else current[key] = value;
    }
    registerRenderedWordPrivateState(word, current);
}

export function renderedWordPrivateValue(word: HTMLElement, key: RenderedWordPrivateKey): string | undefined {
    return readRenderedWordPrivateState(word)?.[key];
}

export function readRenderedWordPrivateState(word: HTMLElement): Readonly<RenderedWordPrivateState> | undefined {
    return privateStateSlot.read(word);
}

function projectPrivateState(word: HTMLElement, state: RenderedWordPrivateState): void {
    const trusted = currentAccountDataSurfaceIsTrusted();
    for (const key of Object.keys(DATASET_KEYS) as RenderedWordPrivateKey[]) {
        const datasetKey = DATASET_KEYS[key];
        const value = state[key];
        if (trusted && value !== undefined) word.dataset[datasetKey] = value;
        else delete word.dataset[datasetKey];
    }
}

function datasetAttributeName(key: keyof DOMStringMap): string {
    return String(key).replace(/[A-Z]/g, character => `-${character.toLowerCase()}`);
}

function escapeAttributeValue(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
