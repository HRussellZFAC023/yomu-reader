import { renderAnkiActionRow, renderAnkiExistingSection, renderReviewButtons } from './anki-render';
import { normalizeCardStates, primaryCardState } from './card-state';
import type { CardRenderData } from './card-render-data';
import { renderDeckChoiceOptions, jpdbDeckLabel } from './deck-choice';
import { escapeHtml } from './dom';
import { renderKanjiDefinitions } from './definition-source-render';
import { uiText, type UiCopyKey } from './i18n';
import { loadMiningContext } from './mining-context';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import { cardPronunciationReading, renderPitch, speakerIcon } from './popup-render';
import type { InterfaceLanguage, JPDBCard, ReaderSettings } from './types';
import type { JpdbVocabularyInfo } from './jpdb-vocabulary';
import type { YomitanMetaEntry, YomitanTermEntry } from './yomitan';

interface MiningActionState {
    isNeverForget: boolean;
    isBlacklisted: boolean;
    neverForgetTitle: string;
    blacklistTitle: string;
    neverForgetLabel: string;
    blacklistLabel: string;
}

interface CardPopoverRenderView {
    cardStates: ReturnType<typeof normalizeCardStates>;
    state: ReturnType<typeof primaryCardState>;
    storedContext: ReturnType<typeof loadMiningContext> | null;
    jpdbUrl: string;
    cardPos: string;
    cardPosDetails: string;
    language: InterfaceLanguage;
    hasJpdb: boolean;
    miningActions: string;
    ankiActions: string;
    reviewButtons: string;
    metaItems: string[];
    loadingDetails: string;
    audioButtonDisabled: boolean;
    audioButtonTitle: string;
}

export interface CardPopoverRendererDependencies {
    getSettings: () => ReaderSettings;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
    renderWordHistory: (language: InterfaceLanguage, trigger: 'modal' | 'hover') => string;
    renderWordPills: (card: JPDBCard, jpdbUrl: string, metaEntries?: YomitanMetaEntry[], overrideQuery?: string) => string;
    renderDefinitionSources: (card: JPDBCard, entries: YomitanTermEntry[], sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null) => string;
    dictionarySourceAttributes: (key: string, initiallyExpanded?: boolean) => string;
    dictionaryLabel: (name: string) => string;
    renderReviewButtonsFallback?: (card: JPDBCard, data: CardRenderData & { loading: boolean }) => string;
}

export class CardPopoverRenderer {
    constructor(private readonly dependencies: CardPopoverRendererDependencies) {}

    render(
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData & { loading: boolean },
    ): string {
        const view = this.renderView(card, data);

        return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body">
                ${this.dependencies.renderWordHistory(view.language, trigger)}
                ${this.renderHeader(card, data, view)}
                ${this.renderPartOfSpeech(view)}
                ${this.dependencies.renderDefinitionSources(card, data.localEntries, sentence, data.jpdbVocabularyInfo)}
                ${view.loadingDetails}
                ${this.renderAnkiExistingSection(data, view)}
                ${renderKanjiDefinitions(data.kanjiEntries, (key, initiallyExpanded) => this.dependencies.dictionarySourceAttributes(key, initiallyExpanded), name => this.dependencies.dictionaryLabel(name), undefined, uiText(view.language, 'kanjiDictionaries'), view.language)}
            </div>
            ${this.renderActions(view)}
        `;
    }

    private renderView(card: JPDBCard, data: CardRenderData & { loading: boolean }): CardPopoverRenderView {
        const cardStates = normalizeCardStates(card.cardState);
        const state = primaryCardState(cardStates);
        const settings = this.settings();
        const language = settings.interfaceLanguage;
        const hasJpdb = this.dependencies.isJpdbBackedCard(card);
        const selectedDeckLabel = jpdbDeckLabel(settings, settings.miningDeck.trim() || 'forq', data.jpdbDecks);
        const reviewBlockReason = !data.ankiLookup.primary?.primaryCardId ? this.reviewBlockReason(cardStates, language) : '';
        return {
            cardStates,
            state,
            storedContext: data.loading ? null : loadMiningContext(card.spelling),
            jpdbUrl: `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`,
            cardPos: formatPartOfSpeech(card.partOfSpeech),
            cardPosDetails: formatPartOfSpeechDetails(card.partOfSpeech),
            language,
            hasJpdb,
            miningActions: this.renderJpdbMiningActions(cardStates, language, data, hasJpdb),
            ankiActions: data.loading ? '' : renderAnkiActionRow(data.ankiLookup, settings),
            reviewButtons: this.renderReviewButtons(card, cardStates, data, hasJpdb, selectedDeckLabel, reviewBlockReason, language),
            metaItems: this.renderMetaItems(card, hasJpdb, state, data),
            loadingDetails: this.renderLoadingDetails(data.loading, language),
            audioButtonDisabled: !settings.audioEnabled,
            audioButtonTitle: uiText(language, settings.audioEnabled ? 'playAudio' : 'audioPlaybackDisabled'),
        };
    }

    private renderHeader(card: JPDBCard, data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        return `<div class="jpdb-reader-header">
            <div class="jpdb-reader-heading">
                ${this.renderTitleRow(card, view)}
                ${this.dependencies.renderWordPills(card, view.jpdbUrl, data.metaEntries)}
            </div>
            <div class="jpdb-reader-card-tools">
                ${this.renderPitch(card, data)}
                <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button" aria-label="${view.audioButtonTitle}" title="${view.audioButtonTitle}"${view.audioButtonDisabled ? ' disabled' : ''}>${speakerIcon()}</button>
            </div>
        </div>`;
    }

    private renderTitleRow(card: JPDBCard, view: CardPopoverRenderView): string {
        return `<div class="jpdb-reader-title-row">
            <div class="jpdb-reader-spelling jpdb-${view.state} jpdb-reader-parseable" data-jpdb-reader-kanji-nav data-jpdb-reader-kanji-nav-label="${escapeHtml(uiText(view.language, 'showKanji'))}">${escapeHtml(card.spelling)}</div>
            ${renderReading(card)}
            ${renderMeta(view.metaItems)}
        </div>`;
    }

    private renderPitch(card: JPDBCard, data: CardRenderData & { loading: boolean }): string {
        return this.settings().showPitchAccent ? renderPitch(card, data.metaEntries) : '';
    }

    private renderPartOfSpeech(view: CardPopoverRenderView): string {
        return view.cardPos ? `<div class="jpdb-reader-pos" title="${escapeHtml(view.cardPosDetails)}">${escapeHtml(view.cardPos)}</div>` : '';
    }

    private renderAnkiExistingSection(data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        return data.loading ? '' : renderAnkiExistingSection(data.ankiLookup, view.storedContext, view.language);
    }

    private renderActions(view: CardPopoverRenderView): string {
        const hasMiningPanel = Boolean(view.miningActions);
        const miningPanel = hasMiningPanel ? this.renderMiningPanel(view) : '';
        return `<div class="jpdb-reader-actions${hasMiningPanel ? ' jpdb-reader-actions-has-mining jpdb-reader-actions-mining-collapsed' : ''}">
            ${renderMiningGutter(miningPanel, view.language)}
            ${miningPanel}
            ${hasMiningPanel ? '' : view.ankiActions}
            ${view.reviewButtons}
        </div>`;
    }

    private renderMiningPanel(view: CardPopoverRenderView): string {
        return `<div class="jpdb-reader-mining-panel">
            ${view.miningActions}
            ${view.ankiActions}
        </div>`;
    }

    private renderJpdbMiningActions(
        cardStates: ReturnType<typeof normalizeCardStates>,
        language: InterfaceLanguage,
        data: CardRenderData & { loading: boolean },
        hasJpdb: boolean,
    ): string {
        if (!this.canRenderJpdbMiningActions(hasJpdb)) return '';
        const state = miningActionState(cardStates, language);
        const addDeckSelect = this.renderAddDeckSelect(data, language);
        return this.renderJpdbMiningActionDetails(language, state, addDeckSelect);
    }

    private canRenderJpdbMiningActions(hasJpdb: boolean): boolean {
        const settings = this.settings();
        return hasJpdb && Boolean(settings.apiKey.trim()) && settings.jpdbMiningEnabled;
    }

    private renderAddDeckSelect(data: CardRenderData & { loading: boolean }, language: InterfaceLanguage): string {
        const deckOptions = renderDeckChoiceOptions(this.settings(), data.jpdbDecks, data.ankiDecks, true);
        if (!deckOptions) return '';
        return `<select class="jpdb-reader-add-deck-select" data-add-deck-select aria-label="${escapeHtml(uiText(language, 'deck'))}">${deckOptions}</select>`;
    }

    private renderJpdbMiningActionDetails(language: InterfaceLanguage, state: MiningActionState, addDeckSelect: string): string {
        const addToDeckLabel = `${uiText(language, 'addToDeck')} +`;
        return `
                <div class="jpdb-reader-mining-details" role="group" aria-label="${escapeHtml(uiText(language, 'deckActions'))}">
                    <div class="jpdb-reader-row jpdb-reader-mining-action-row" style="--cols: 3">
                        <button class="jpdb-reader-btn add jpdb-reader-mining-title" data-action="deck-picker" title="${escapeHtml(uiText(language, 'addToDeckHint'))}" aria-expanded="false">${escapeHtml(addToDeckLabel)}</button>
                        <button class="jpdb-reader-btn nf${state.isNeverForget ? ' danger' : ''}" data-action="neverforget" title="${escapeHtml(state.neverForgetTitle)}" aria-pressed="${state.isNeverForget}">${state.neverForgetLabel}</button>
                        <button class="jpdb-reader-btn blacklist" data-action="blacklist" title="${escapeHtml(state.blacklistTitle)}" aria-pressed="${state.isBlacklisted}">${state.blacklistLabel}</button>
                    </div>
                    ${addDeckSelect}
                </div>
            `;
    }

    private renderReviewButtons(
        card: JPDBCard,
        cardStates: ReturnType<typeof normalizeCardStates>,
        data: CardRenderData & { loading: boolean },
        hasJpdb: boolean,
        selectedDeckLabel: string,
        reviewBlockReason: string,
        language: InterfaceLanguage,
    ): string {
        if (!this.shouldRenderReviewButtons(data, hasJpdb, reviewBlockReason)) {
            return this.dependencies.renderReviewButtonsFallback?.(card, data) ?? '';
        }
        return renderReviewButtons(this.settings(), data.ankiLookup.primary, {
            title: cardStates.includes('not-in-deck') ? `${uiText(language, 'reviewAddsToDeck')} ${selectedDeckLabel}` : '',
        });
    }

    private shouldRenderReviewButtons(data: CardRenderData & { loading: boolean }, hasJpdb: boolean, reviewBlockReason: string): boolean {
        if (reviewBlockReason || data.loading || !this.settings().enableReviews) return false;
        return this.canReviewWithJpdb(hasJpdb) || Boolean(data.ankiLookup.primary?.primaryCardId);
    }

    private canReviewWithJpdb(hasJpdb: boolean): boolean {
        const settings = this.settings();
        return hasJpdb && Boolean(settings.apiKey.trim()) && settings.jpdbMiningEnabled;
    }

    private renderMetaItems(card: JPDBCard, hasJpdb: boolean, state: string, data: CardRenderData & { loading: boolean }): string[] {
        return [
            card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : '',
            hasJpdb ? `<span><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml(cardStateLabel(state, this.settings().interfaceLanguage))}</span>` : '',
            data.ankiLookup.primary ? `<span><span class="jpdb-reader-state-dot jpdb-${data.ankiLookup.state}"></span>Anki ${escapeHtml(cardStateLabel(data.ankiLookup.state, this.settings().interfaceLanguage))}</span>` : '',
        ].filter(Boolean);
    }

    private renderLoadingDetails(loading: boolean, language: InterfaceLanguage): string {
        return loading ? `<div class="jpdb-reader-help" data-card-details-loading>${escapeHtml(uiText(language, 'loadingDictionaryDetails'))}</div>` : '';
    }

    private reviewBlockReason(cardStates: ReturnType<typeof normalizeCardStates>, language: InterfaceLanguage): string {
        if (cardStates.includes('blacklisted')) return uiText(language, 'reviewBlockedBlacklisted');
        if (cardStates.includes('never-forget')) return uiText(language, 'reviewBlockedNeverForget');
        return '';
    }

    private settings(): ReaderSettings {
        return this.dependencies.getSettings();
    }
}

function miningActionState(cardStates: ReturnType<typeof normalizeCardStates>, language: InterfaceLanguage): MiningActionState {
    const isNeverForget = cardStates.includes('never-forget');
    const isBlacklisted = cardStates.includes('blacklisted');
    return {
        isNeverForget,
        isBlacklisted,
        neverForgetTitle: isNeverForget ? uiText(language, 'forgetHint') : uiText(language, 'neverHint'),
        blacklistTitle: isBlacklisted ? uiText(language, 'unlistHint') : uiText(language, 'blacklistHint'),
        neverForgetLabel: isNeverForget ? uiText(language, 'forget') : uiText(language, 'never'),
        blacklistLabel: isBlacklisted ? uiText(language, 'unlist') : uiText(language, 'blacklist'),
    };
}

function renderReading(card: JPDBCard): string {
    const reading = cardPronunciationReading(card);
    return reading && reading !== card.spelling ? `<div class="jpdb-reader-reading">${escapeHtml(reading)}</div>` : '';
}

function renderMeta(metaItems: string[]): string {
    return metaItems.length ? `<div class="jpdb-reader-meta">${metaItems.join('')}</div>` : '';
}

function renderMiningGutter(miningActions: string, language: InterfaceLanguage): string {
    return miningActions
        ? `<div class="jpdb-reader-actions-gutter"><button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="${escapeHtml(uiText(language, 'showMiningActions'))}" aria-label="${escapeHtml(uiText(language, 'showMiningActions'))}"></button></div>`
        : '';
}

function cardStateLabel(state: string, language: InterfaceLanguage): string {
    const key = CARD_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : state;
}

const CARD_STATE_LABEL_KEYS: Record<string, UiCopyKey> = {
    new: 'stateNew',
    learning: 'stateLearning',
    known: 'stateKnown',
    due: 'stateDue',
    failed: 'stateFailed',
    locked: 'stateLocked',
    'never-forget': 'stateNeverForget',
    blacklisted: 'stateBlacklisted',
    suspended: 'stateSuspended',
    'not-in-deck': 'stateNotInDeck',
    redundant: 'stateRedundant',
};
