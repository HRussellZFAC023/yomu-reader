import type { JPDBGrade } from '../app/types';
import { createPrivateElementStateSlot } from './private-element-state';

export type CardCommandAction =
    | 'add'
    | 'add-default'
    | 'anki'
    | 'anki-edit'
    | 'anki-media-audio'
    | 'anki-merge'
    | 'audio'
    | 'blacklist'
    | 'bunpro-audio'
    | 'copy-word'
    | 'grade'
    | 'grade-provider-toggle'
    | 'jiten-audio'
    | 'jpdb-example-audio'
    | 'neverforget'
    | 'setup-dictionaries'
    | 'setup-jpdb'
    | 'study-grammar'
    | 'study-grammar-toggle-known'
    | 'study-grammar-toggle-known-visibility'
    | 'study-read-sentence'
    | 'study-translate'
    | 'wanikani-audio';

export type CardCommandCapability = Readonly<{
    kind: 'card-action';
    action: CardCommandAction;
    grade?: JPDBGrade;
    noteId?: number;
    mediaFilename?: string;
    sentence?: string;
    audioUrl?: string;
    audioIds?: string;
    audioUrls?: readonly string[];
    jitenSentenceId?: number;
    jitenWordId?: number;
    jitenReadingIndex?: number;
    grammarRuleId?: string;
    grammarKnown?: boolean;
    deckSource?: 'jpdb' | 'jiten' | 'bunpro' | 'yomu-local' | 'anki';
    deckId?: string;
    reviewTarget?: 'both' | 'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki';
    ankiCardId?: number;
    audioMergeMode?: 'both' | 'theirs' | 'ours';
}>;

export type CardUiCommandCapability = Readonly<{
    kind: 'card-ui';
    action: 'deck-picker' | 'mining-collapse' | 'review-target-toggle';
}>;

export type DeckChoiceCapability = Readonly<{
    kind: 'deck-choice';
    source: 'jpdb' | 'jiten' | 'bunpro' | 'yomu-local' | 'anki';
    id: string;
}>;

export type ReviewTargetCapability = Readonly<{
    kind: 'review-target';
    target: 'both' | 'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki';
    gradeProfile: 'standard' | 'bunpro-regular' | 'bunpro-fsrs';
    label: string;
    shortLabel: string;
    ankiCardId?: number;
}>;

export type AnkiAudioMergeCapability = Readonly<{
    kind: 'anki-audio-merge';
    mode: 'both' | 'theirs' | 'ours';
}>;

export type KanjiCommandCapability = Readonly<{
    kind: 'kanji-lookup';
    kanji: string;
}>;

export type JpdbKanjiCommandCapability = Readonly<{
    kind: 'jpdb-kanji-action';
    actionId: string;
}>;

export type KanjiWordCommandCapability = Readonly<{
    kind: 'kanji-word';
    expression: string;
    reading: string;
}>;

export type JitenKanjiWordsCommandCapability = Readonly<{
    kind: 'jiten-kanji-words';
    action: 'filter' | 'more';
    character: string;
    reading: string;
    page?: number;
    pageSize?: number;
    total?: number;
}>;

export type TokenChoiceCommandCapability = Readonly<{
    kind: 'token-choice';
    vid: number;
    sid: number;
}>;

export type SubtitleCommandAction =
    | 'bm-add'
    | 'bm-all'
    | 'bm-clear'
    | 'bm-copy'
    | 'bm-grade'
    | 'bm-grade-selected'
    | 'bm-open'
    | 'bm-scan'
    | 'bm-toggle'
    | 'close-panel'
    | 'copy'
    | 'copy-row'
    | 'cue'
    | 'jump-current'
    | 'load'
    | 'load-secondary'
    | 'next'
    | 'ocr'
    | 'offset-earlier'
    | 'offset-later'
    | 'offset-next'
    | 'offset-previous'
    | 'offset-reset'
    | 'panel'
    | 'panel-lines'
    | 'panel-mine'
    | 'panel-options'
    | 'panel-shadow'
    | 'panel-tracks'
    | 'peek-row'
    | 'previous'
    | 'primary-track'
    | 'rail-expand'
    | 'secondary-track'
    | 'shadow-auto-pause'
    | 'shadow-goto'
    | 'shadow-loop'
    | 'shadow-play-recording'
    | 'shadow-record'
    | 'shadow-replay'
    | 'shadow-toggle-text'
    | 'style'
    | 'style-reset'
    | 'toggle-native-blur'
    | 'toggle-pause-panel'
    | 'transcript-placement'
    | 'visibility';

export type SubtitleCommandCapability = Readonly<{
    kind: 'subtitle-action';
    action: SubtitleCommandAction;
    rowIndex?: number;
    trackId?: string;
    candidateIndex?: number;
    candidateKey?: string;
    grade?: JPDBGrade;
    placement?: 'left' | 'bottom' | 'right';
    shadowDirection?: 'prev' | 'next';
}>;

export type SubtitleStyleSetting =
    | 'subtitleNativeDisplay'
    | 'subtitleNativeBlurStrength'
    | 'subtitleFontSize'
    | 'subtitleFontWeight'
    | 'subtitleBackgroundOpacity'
    | 'subtitleFontFamily'
    | 'subtitleMiningPause'
    | 'subtitleHoverPause';

export type SubtitleStyleControlCapability = Readonly<{
    kind: 'subtitle-style-control';
    setting: SubtitleStyleSetting;
}>;

export type SubtitleStyleOptionCapability = Readonly<{
    kind: 'subtitle-style-option';
    setting: 'subtitleNativeDisplay' | 'subtitleFontFamily';
    value: string;
}>;

export type PrivateCommandCapability =
    | CardCommandCapability
    | CardUiCommandCapability
    | DeckChoiceCapability
    | ReviewTargetCapability
    | AnkiAudioMergeCapability
    | KanjiCommandCapability
    | JpdbKanjiCommandCapability
    | KanjiWordCommandCapability
    | JitenKanjiWordsCommandCapability
    | TokenChoiceCommandCapability
    | SubtitleCommandCapability
    | SubtitleStyleControlCapability
    | SubtitleStyleOptionCapability;

export type PrivateCommandHandlers = {
    [Kind in PrivateCommandCapability['kind']]?: (
        command: Extract<PrivateCommandCapability, { kind: Kind }>,
    ) => void;
};

const commandCapabilities = createPrivateElementStateSlot(immutableCommandSnapshot);

/**
 * Carries an immutable command through an HTML string. `setInnerHtml` consumes
 * the opaque token synchronously, removes it, and binds the imported Element in
 * a WeakMap before page MutationObservers can rewrite presentation attributes.
 */
export function privateCommandAttributes(command: PrivateCommandCapability): string {
    return commandCapabilities.attributes(command);
}

/** Bind a programmatically-created control without putting authority in DOM. */
export function bindPrivateCommandCapability(element: Element, command: PrivateCommandCapability): void {
    commandCapabilities.bind(element, command);
}

/** Preserve a one-shot command across a detached Element -> HTML serialization. */
export function preparePrivateCommandSerialization(element: Element, command: PrivateCommandCapability): void {
    commandCapabilities.prepareSerialization(element, command);
}

/**
 * Resolve only previously-bound authority. Deliberately never hydrates lazily:
 * a token left mutable in live DOM would let a host script copy it elsewhere.
 */
export function readPrivateCommandCapability(element: Element | null | undefined): PrivateCommandCapability | undefined {
    return commandCapabilities.read(element);
}

/** Routes a bound capability by its private kind without consulting DOM attributes. */
export function dispatchPrivateCommand(element: Element | null | undefined, handlers: PrivateCommandHandlers): boolean {
    const command = readPrivateCommandCapability(element);
    if (!command) return false;
    const handler = handlers[command.kind] as ((value: PrivateCommandCapability) => void) | undefined;
    if (!handler) return false;
    handler(command);
    return true;
}

export function readCardCommandCapability(element: Element | null | undefined): CardCommandCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'card-action' ? command : undefined;
}

export function readCardUiCommandCapability(element: Element | null | undefined): CardUiCommandCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'card-ui' ? command : undefined;
}

export function readDeckChoiceCapability(element: Element | null | undefined): DeckChoiceCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'deck-choice' ? command : undefined;
}

export function readReviewTargetCapability(element: Element | null | undefined): ReviewTargetCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'review-target' ? command : undefined;
}

export function readAnkiAudioMergeCapability(element: Element | null | undefined): AnkiAudioMergeCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'anki-audio-merge' ? command : undefined;
}

export function readKanjiCommandCapability(element: Element | null | undefined): KanjiCommandCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'kanji-lookup' ? command : undefined;
}

export function readJpdbKanjiCommandCapability(element: Element | null | undefined): JpdbKanjiCommandCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'jpdb-kanji-action' ? command : undefined;
}

export function readJitenKanjiWordsCommandCapability(element: Element | null | undefined): JitenKanjiWordsCommandCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'jiten-kanji-words' ? command : undefined;
}

export function readTokenChoiceCommandCapability(element: Element | null | undefined): TokenChoiceCommandCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'token-choice' ? command : undefined;
}

export function readSubtitleCommandCapability(element: Element | null | undefined): SubtitleCommandCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'subtitle-action' ? command : undefined;
}

export function readSubtitleStyleControlCapability(element: Element | null | undefined): SubtitleStyleControlCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'subtitle-style-control' ? command : undefined;
}

export function readSubtitleStyleOptionCapability(element: Element | null | undefined): SubtitleStyleOptionCapability | undefined {
    const command = readPrivateCommandCapability(element);
    return command?.kind === 'subtitle-style-option' ? command : undefined;
}

export function resolvePrivateReviewSelection(root: ParentNode | null | undefined, fallbackAnkiCardId: number | null): {
    reviewTarget?: 'both' | 'jpdb' | 'jiten' | 'bunpro' | 'yomu-local' | 'anki';
    ankiCardId: number | null;
} {
    const actions = reviewActionsRoot(root);
    const selected = selectedReviewTargetCapability(actions);
    const visible = visibleReviewCardCapability(actions);
    const reviewTarget = privateReviewTarget(firstDefined(
        selectedReviewTarget(selected),
        visibleReviewTarget(visible),
    ));
    const explicitAnkiCardId = positiveAnkiCardId(firstDefined(
        selectedReviewAnkiCardId(selected),
        visibleReviewAnkiCardId(visible),
    ));
    const ankiCardId = explicitAnkiCardId === undefined
        ? fallbackAnkiCardIdForReviewTarget(reviewTarget, fallbackAnkiCardId)
        : explicitAnkiCardId;
    return { reviewTarget, ankiCardId };
}

export function readPrivateReviewTarget(button: HTMLButtonElement): {
    target?: CardCommandCapability['reviewTarget'] | ReviewTargetCapability['target'];
    ankiCardId?: number;
} {
    const selected = selectedReviewTargetCapability(button.closest('.jpdb-reader-actions'));
    const command = readCardCommandCapability(button);
    return {
        target: firstDefined(selectedReviewTarget(selected), visibleReviewTarget(command)),
        ankiCardId: firstDefined(selectedReviewAnkiCardId(selected), visibleReviewAnkiCardId(command)),
    };
}

type PrivateReviewTarget = Exclude<ReviewTargetCapability['target'], 'wanikani'>;

const PRIVATE_REVIEW_TARGETS = new Set<ReviewTargetCapability['target']>([
    'both',
    'jpdb',
    'jiten',
    'bunpro',
    'yomu-local',
    'anki',
]);

function reviewActionsRoot(root: ParentNode | null | undefined): HTMLElement | null {
    return root ? root.querySelector<HTMLElement>('.jpdb-reader-actions') : null;
}

function selectedReviewTargetCapability(actions: ParentNode | null): ReviewTargetCapability | undefined {
    const select = actions?.querySelector<HTMLSelectElement>('[data-review-target-select]');
    if (!select) return undefined;
    return readReviewTargetCapability(select.options[select.selectedIndex]);
}

function visibleReviewCardCapability(actions: ParentNode | null): CardCommandCapability | undefined {
    const button = actions?.querySelector<HTMLButtonElement>(
        '[data-review-target-row]:not([hidden]) [data-action="grade"][data-grade]',
    );
    return readCardCommandCapability(button);
}

function selectedReviewTarget(command: ReviewTargetCapability | undefined): ReviewTargetCapability['target'] | undefined {
    return command ? command.target : undefined;
}

function visibleReviewTarget(command: CardCommandCapability | undefined): CardCommandCapability['reviewTarget'] {
    return command ? command.reviewTarget : undefined;
}

function selectedReviewAnkiCardId(command: ReviewTargetCapability | undefined): number | undefined {
    return command ? command.ankiCardId : undefined;
}

function visibleReviewAnkiCardId(command: CardCommandCapability | undefined): number | undefined {
    return command ? command.ankiCardId : undefined;
}

function firstDefined<T>(primary: T | undefined, fallback: T | undefined): T | undefined {
    return primary === undefined ? fallback : primary;
}

function positiveAnkiCardId(value: number | undefined): number | undefined {
    if (typeof value !== 'number') return undefined;
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

function fallbackAnkiCardIdForReviewTarget(
    reviewTarget: PrivateReviewTarget | undefined,
    fallbackAnkiCardId: number | null,
): number | null {
    if (!reviewTarget) return fallbackAnkiCardId;
    return reviewTarget === 'anki' || reviewTarget === 'both' ? fallbackAnkiCardId : null;
}

function privateReviewTarget(value: string | undefined): 'both' | 'jpdb' | 'jiten' | 'bunpro' | 'yomu-local' | 'anki' | undefined {
    return value && PRIVATE_REVIEW_TARGETS.has(value as ReviewTargetCapability['target'])
        ? value as PrivateReviewTarget
        : undefined;
}

function immutableCommandSnapshot(command: PrivateCommandCapability): PrivateCommandCapability {
    if (command.kind === 'card-action' && command.audioUrls) {
        return Object.freeze({ ...command, audioUrls: Object.freeze([...command.audioUrls]) });
    }
    return Object.freeze({ ...command });
}
