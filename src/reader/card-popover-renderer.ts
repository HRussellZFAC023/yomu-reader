import { ANKI_SOURCE_ID } from './constants';
import { renderAnkiActionRow, renderAnkiExistingSection, renderAnkiNewCardPreview, renderReviewButtons, reviewButtonGrades } from './anki-render';
import { normalizeCardStates, primaryCardState } from './card-state';
import type { CardRenderData } from './card-render-data';
import { renderDeckChoiceOptions, jpdbDeckLabel } from './deck-choice';
import { escapeHtml, renderKanjiNavigationText } from './dom';
import { renderKanjiDefinitions } from './definition-source-render';
import { cardStateLabel, uiText } from './i18n';
import { speakerIcon } from './icons';
import { loadMiningContext } from './mining-context';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import { cardPronunciationReading, renderPitch } from './popup-render';
import { apiSrsProviderViewForCard, isApiMiningEnabled, type ApiSrsProviderView } from './srs-providers';
import type { InterfaceLanguage, JPDBCard, ReaderSettings } from './types';
import type { JpdbVocabularyInfo } from './jpdb-vocabulary';
import type { YomitanMetaEntry, YomitanTermEntry } from './yomitan';
import { newTabText } from './newtab/i18n';

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
    provider: ApiSrsProviderView | null;
    miningActions: string;
    miningInitiallyExpanded: boolean;
    ankiActions: string;
    reviewButtons: string;
    metaItems: string[];
    loadingDetails: string;
    audioButtonDisabled: boolean;
    audioButtonTitle: string;
}

interface ReviewButtonsRenderOptions {
    card: JPDBCard;
    cardStates: ReturnType<typeof normalizeCardStates>;
    data: CardRenderData & { loading: boolean };
    provider: ApiSrsProviderView | null;
    selectedDeckLabel: string;
    reviewBlockReason: string;
    language: InterfaceLanguage;
}

interface PopoverReviewTarget {
    id: string;
    kind: 'both' | 'jpdb' | 'jiten' | 'anki';
    label: string;
    shortLabel: string;
    ankiCardId?: number;
    plainLabel?: string;
}

export interface CardPopoverRendererDependencies {
    getSettings: () => ReaderSettings;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
    renderWordHistory: (language: InterfaceLanguage, trigger: 'modal' | 'hover') => string;
    renderWordPills: (card: JPDBCard, jpdbUrl: string, metaEntries?: YomitanMetaEntry[], overrideQuery?: string) => string;
    renderDefinitionSources: (card: JPDBCard, entries: YomitanTermEntry[], sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null, extraSections?: Record<string, string>) => string;
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
        const ankiSourceSection = this.renderAnkiSourceSection(card, sentence, data, view);
        const definitionSources = this.dependencies.renderDefinitionSources(card, data.localEntries, sentence, data.jpdbVocabularyInfo, {
            [ANKI_SOURCE_ID]: ankiSourceSection,
        });
        const fallbackAnkiSection = ankiSourceSection && !definitionSources.includes('jpdb-reader-anki-existing')
            ? ankiSourceSection
            : '';

        return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body">
                ${this.dependencies.renderWordHistory(view.language, trigger)}
                ${this.renderHeader(card, data, view)}
                ${this.renderPartOfSpeech(view)}
                ${definitionSources}
                ${fallbackAnkiSection}
                ${view.loadingDetails}
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
        const provider = this.apiProviderForCard(card);
        const selectedDeckLabel = this.selectedApiDeckLabel(provider, data);
        const reviewBlockReason = !data.ankiLookup.primary?.primaryCardId ? this.reviewBlockReason(cardStates, language) : '';
        const miningActions = this.renderApiMiningActions(cardStates, language, data, provider);
        const ankiActions = data.loading ? '' : renderAnkiActionRow(data.ankiLookup, settings);
        return {
            cardStates,
            state,
            storedContext: data.loading ? null : loadMiningContext(card.spelling),
            jpdbUrl: `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`,
            cardPos: formatPartOfSpeech(card.partOfSpeech),
            cardPosDetails: formatPartOfSpeechDetails(card.partOfSpeech),
            language,
            provider,
            miningActions,
            miningInitiallyExpanded: Boolean(miningActions && (reviewBlockReason || ankiActions)),
            ankiActions,
            reviewButtons: this.renderReviewButtons({
                card,
                cardStates,
                data,
                provider,
                selectedDeckLabel,
                reviewBlockReason,
                language,
            }),
            metaItems: this.renderMetaItems(card, provider, state, data),
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
            <div class="jpdb-reader-spelling jpdb-${view.state}" data-jpdb-reader-kanji-nav data-jpdb-reader-kanji-nav-label="${escapeHtml(uiText(view.language, 'showKanji'))}">${renderKanjiNavigationText(card.spelling, { enabled: true, label: uiText(view.language, 'showKanji') })}</div>
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
        return data.loading ? '' : renderAnkiExistingSection(data.ankiLookup, view.storedContext, this.settings(), {
            suppressReviewButtons: Boolean(view.reviewButtons),
        });
    }

    private renderAnkiSourceSection(card: JPDBCard, sentence: string | undefined, data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        return this.renderAnkiExistingSection(data, view) || this.renderAnkiNewCardPreview(card, sentence, data, view);
    }

    private renderAnkiNewCardPreview(card: JPDBCard, sentence: string | undefined, data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        if (data.loading || data.ankiLookup.primary || data.ankiLookup.trusted === false || data.ankiLookup.state !== 'not-in-deck') return '';
        const settings = this.settings();
        return renderAnkiNewCardPreview(card, sentence, settings, {
            localEntries: data.localEntries,
            kanjiEntries: data.kanjiEntries,
            metaEntries: data.metaEntries,
            dictionaryPreferences: settings.dictionaryPreferences,
            sourceTitle: view.storedContext?.sourceTitle,
            sourceUrl: view.storedContext?.sourceUrl,
        });
    }

    private renderActions(view: CardPopoverRenderView): string {
        const hasMiningPanel = Boolean(view.miningActions);
        const miningPanel = hasMiningPanel ? this.renderMiningPanel(view) : '';
        const miningClass = hasMiningPanel
            ? ` jpdb-reader-actions-has-mining${view.miningInitiallyExpanded ? '' : ' jpdb-reader-actions-mining-collapsed'}`
            : '';
        return `<div class="jpdb-reader-actions${miningClass}">
            ${renderMiningGutter(miningPanel, view.language, view.miningInitiallyExpanded)}
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

    private renderApiMiningActions(
        cardStates: ReturnType<typeof normalizeCardStates>,
        language: InterfaceLanguage,
        data: CardRenderData & { loading: boolean },
        provider: ApiSrsProviderView | null,
    ): string {
        if (!this.canRenderApiMiningActions(provider)) return '';
        const state = miningActionState(cardStates, language);
        const addDeckSelect = this.renderAddDeckSelect(data, language, provider);
        return this.renderApiMiningActionDetails(language, state, addDeckSelect);
    }

    private canRenderApiMiningActions(provider: ApiSrsProviderView | null): boolean {
        const settings = this.settings();
        return Boolean(provider?.hasApiKey && isApiMiningEnabled(settings));
    }

    private renderAddDeckSelect(data: CardRenderData & { loading: boolean }, language: InterfaceLanguage, provider: ApiSrsProviderView | null): string {
        const deckOptions = renderDeckChoiceOptions(this.settings(), data.jpdbDecks, data.ankiDecks, {
            includeJpdb: provider?.id === 'jpdb',
            includeJiten: provider?.id === 'jiten',
            jitenDecks: data.jitenDecks ?? [],
        });
        if (!deckOptions) return '';
        return `<select class="jpdb-reader-add-deck-select" data-add-deck-select aria-label="${escapeHtml(uiText(language, 'deck'))}" hidden>${deckOptions}</select>`;
    }

    private renderApiMiningActionDetails(language: InterfaceLanguage, state: MiningActionState, addDeckSelect: string): string {
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

    private renderReviewButtons(options: ReviewButtonsRenderOptions): string {
        const { card, cardStates, data, provider, selectedDeckLabel, reviewBlockReason, language } = options;
        const earlyResult = this.reviewButtonsEarlyResult(card, data, reviewBlockReason);
        if (earlyResult !== undefined) return earlyResult;
        const targets = this.popoverReviewTargets(data, provider, language);
        if (targets.length) return this.renderTargetedReviewButtons(targets, language);
        if (!this.shouldRenderReviewButtons(data, provider, reviewBlockReason)) {
            return this.dependencies.renderReviewButtonsFallback?.(card, data) ?? '';
        }
        return this.renderApiReviewButtons(provider, data, cardStates, selectedDeckLabel, language);
    }

    private reviewButtonsEarlyResult(
        card: JPDBCard,
        data: CardRenderData & { loading: boolean },
        reviewBlockReason: string,
    ): string | undefined {
        if (reviewBlockReason) return `<div class="jpdb-reader-help jpdb-reader-review-blocked">${escapeHtml(reviewBlockReason)}</div>`;
        if (data.loading || !this.settings().enableReviews) return this.dependencies.renderReviewButtonsFallback?.(card, data) ?? '';
        return undefined;
    }

    private renderApiReviewButtons(
        provider: ApiSrsProviderView | null,
        data: CardRenderData & { loading: boolean },
        cardStates: ReturnType<typeof normalizeCardStates>,
        selectedDeckLabel: string,
        language: InterfaceLanguage,
    ): string {
        return renderReviewButtons(this.settings(), null, {
            targetLabel: provider?.label ?? uiText(language, 'gradeJpdbCardTarget'),
            title: reviewButtonTitle(data, cardStates, selectedDeckLabel, language),
        });
    }

    private shouldRenderReviewButtons(data: CardRenderData & { loading: boolean }, provider: ApiSrsProviderView | null, reviewBlockReason: string): boolean {
        if (reviewBlockReason || data.loading || !this.settings().enableReviews) return false;
        return this.canReviewWithApiProvider(provider);
    }

    private canReviewWithApiProvider(provider: ApiSrsProviderView | null): boolean {
        const settings = this.settings();
        return Boolean(provider?.hasApiKey && isApiMiningEnabled(settings));
    }

    private popoverReviewTargets(
        data: CardRenderData & { loading: boolean },
        provider: ApiSrsProviderView | null,
        language: InterfaceLanguage,
    ): PopoverReviewTarget[] {
        const apiTarget = provider && this.canReviewWithApiProvider(provider) ? this.apiReviewTarget(provider, language) : null;
        const ankiTargets = this.ankiReviewTargets(data, language);
        if (apiTarget && ankiTargets.length) {
            const apiProvider = provider;
            if (!apiProvider) return ankiTargets;
            const primaryAnki = ankiTargets[0];
            return [
                this.bothReviewTarget(apiProvider, primaryAnki, language),
                apiTarget,
                ...ankiTargets,
            ];
        }
        if (ankiTargets.length) return ankiTargets;
        return apiTarget ? [apiTarget] : [];
    }

    private apiReviewTarget(provider: ApiSrsProviderView, language: InterfaceLanguage): PopoverReviewTarget {
        const isJiten = provider.id === 'jiten';
        return {
            id: provider.id,
            kind: isJiten ? 'jiten' : 'jpdb',
            label: newTabText(language, isJiten ? 'gradeTargetJiten' : 'gradeTargetJpdb'),
            shortLabel: provider.label,
        };
    }

    private bothReviewTarget(provider: ApiSrsProviderView, ankiTarget: PopoverReviewTarget, language: InterfaceLanguage): PopoverReviewTarget {
        const label = provider.id === 'jiten'
            ? newTabText(language, 'gradeTargetJitenAndAnki')
            : newTabText(language, 'gradeTargetJpdbAndAnki');
        return {
            id: 'both',
            kind: 'both',
            label: formatTargetLabel(label, ankiTarget.plainLabel ?? ankiTarget.shortLabel),
            shortLabel: newTabText(language, 'gradeTargetBoth'),
            ankiCardId: ankiTarget.ankiCardId,
        };
    }

    private ankiReviewTargets(data: CardRenderData & { loading: boolean }, language: InterfaceLanguage): PopoverReviewTarget[] {
        const settings = this.settings();
        if (!settings.enableReviews || !settings.ankiSectionEnabled) return [];
        const candidates = new Map<number, string>();
        const add = (cardId: number | null | undefined, label: string, cardName = ''): void => {
            const id = Number(cardId);
            if (!Number.isFinite(id) || id <= 0 || candidates.has(id)) return;
            const deck = label.trim() || 'Anki';
            const template = cardName.trim();
            candidates.set(id, template ? [deck, `${template} #${id}`].join(' · ') : [deck, `#${id}`].join(' '));
        };
        const orderedNotes = data.ankiLookup.primary
            ? [
                data.ankiLookup.primary,
                ...data.ankiLookup.notes.filter(note => note !== data.ankiLookup.primary),
            ]
            : data.ankiLookup.notes;
        orderedNotes.forEach(note => {
            const noteLabel = note.deckNames.join(', ') || note.modelName || 'Anki';
            note.renderedCards?.forEach(rendered => add(rendered.cardId, rendered.deckName || noteLabel, rendered.cardName));
            add(note.primaryCardId, noteLabel);
            note.cardIds.forEach(cardId => add(cardId, noteLabel));
        });
        const primary = data.ankiLookup.primary;
        if (primary && !data.ankiLookup.notes.includes(primary)) {
            const noteLabel = primary.deckNames.join(', ') || primary.modelName || 'Anki';
            primary.renderedCards?.forEach(rendered => add(rendered.cardId, rendered.deckName || noteLabel, rendered.cardName));
            add(primary.primaryCardId, noteLabel);
            primary.cardIds.forEach(cardId => add(cardId, noteLabel));
        }
        return Array.from(candidates, ([cardId, label]) => ({
            id: `anki:${cardId}`,
            kind: 'anki' as const,
            ankiCardId: cardId,
            plainLabel: label,
            label: formatTargetLabel(newTabText(language, 'gradeTargetAnki'), label),
            shortLabel: compactAnkiTargetLabel(label, cardId),
        }));
    }

    private renderTargetedReviewButtons(targets: PopoverReviewTarget[], language: InterfaceLanguage): string {
        const settings = this.settings();
        const grades = reviewButtonGrades(settings);
        const selected = targets[0];
        if (!selected || !grades.length) return '';
        const selector = targets.length > 1 ? renderReviewTargetSelector(targets, language) : '';
        const targetLabel = renderReviewTargetLabel(selected);
        const targetAttrs = reviewTargetButtonAttrs(selected);
        return `
            ${selector}
            <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}" data-review-target-row>
                ${targetLabel}
                ${grades.map(([grade, label]) => {
                    const title = selected.label ? ` title="${escapeHtml(selected.label)}" aria-label="${escapeHtml(`${label}: ${selected.label}`)}"` : '';
                    return `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${targetAttrs}${title}>${escapeHtml(label)}</button>`;
                }).join('')}
            </div>
        `;
    }

    private renderMetaItems(card: JPDBCard, provider: ApiSrsProviderView | null, state: string, data: CardRenderData & { loading: boolean }): string[] {
        const settings = this.settings();
        const canShowProviderStatus = Boolean(provider?.hasApiKey);
        return [
            renderMetaReading(card),
            card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : '',
            canShowProviderStatus ? `<span><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml(provider?.label ?? 'API')} ${escapeHtml(cardStateLabel(state, settings.interfaceLanguage))}</span>` : '',
            renderAnkiMeta(data.ankiLookup, settings.interfaceLanguage),
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

    private apiProviderForCard(card: JPDBCard): ApiSrsProviderView | null {
        return apiSrsProviderViewForCard(card, this.settings(), this.dependencies.isJpdbBackedCard);
    }

    private selectedApiDeckLabel(provider: ApiSrsProviderView | null, data: CardRenderData & { loading: boolean }): string {
        if (provider?.id === 'jiten') return jitenDeckLabel((data.jitenDecks ?? [])[0]);
        return jpdbDeckLabel(this.settings(), this.settings().miningDeck.trim() || 'forq', data.jpdbDecks);
    }
}

function renderReviewTargetSelector(targets: PopoverReviewTarget[], language: InterfaceLanguage): string {
    return `<label class="jpdb-reader-newtab-grade-target-selector jpdb-reader-popover-grade-target-selector" data-review-target-selector>
        <span class="jpdb-reader-newtab-grade-target-selector-label">${escapeHtml(newTabText(language, 'gradeTargetSelector'))}</span>
        <select class="jpdb-reader-newtab-grade-target-select" data-review-target-select aria-label="${escapeHtml(newTabText(language, 'gradeTargetSelector'))}">
            ${targets.map((target, index) => `<option value="${escapeHtml(target.id)}"${index === 0 ? ' selected' : ''} data-review-target="${target.kind}" data-review-target-label="${escapeHtml(target.label)}" data-review-target-short-label="${escapeHtml(target.shortLabel)}"${target.ankiCardId ? ` data-anki-card-id="${target.ankiCardId}"` : ''}>${escapeHtml(target.shortLabel)}</option>`).join('')}
        </select>
    </label>`;
}

function renderReviewTargetLabel(target: PopoverReviewTarget): string {
    const chip = target.shortLabel
        ? `<span class="jpdb-reader-newtab-grade-target-chip" data-newtab-grade-target-chip="${escapeHtml(target.kind)}">${escapeHtml(target.shortLabel)}</span>`
        : '';
    return `<div class="jpdb-reader-newtab-grade-target" data-review-target-label>${chip}<span data-newtab-grade-target-text>${escapeHtml(target.label)}</span></div>`;
}

function reviewTargetButtonAttrs(target: PopoverReviewTarget): string {
    return ` data-review-target="${target.kind}"${target.ankiCardId ? ` data-anki-card-id="${target.ankiCardId}"` : ''}`;
}

function formatTargetLabel(template: string, target: string): string {
    return template.replaceAll('{target}', target);
}

function compactAnkiTargetLabel(label: string, cardId: number): string {
    const suffix = `#${cardId}`;
    const clean = label.replace(/\s+/g, ' ').trim();
    if (!clean) return `Anki ${suffix}`;
    return clean.endsWith(suffix) ? clean : `${clean} ${suffix}`;
}

function reviewButtonTitle(
    data: CardRenderData & { loading: boolean },
    cardStates: ReturnType<typeof normalizeCardStates>,
    selectedDeckLabel: string,
    language: InterfaceLanguage,
): string {
    const reviewAddsToDeck = !data.ankiLookup.primary?.primaryCardId && cardStates.includes('not-in-deck');
    return reviewAddsToDeck ? `${uiText(language, 'reviewAddsToDeck')} ${selectedDeckLabel}` : '';
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

function renderMetaReading(card: JPDBCard): string {
    const reading = cardPronunciationReading(card);
    return reading ? `<span class="jpdb-reader-meta-reading">${escapeHtml(reading)}</span>` : '';
}

function renderAnkiMeta(lookup: CardRenderData['ankiLookup'], language: InterfaceLanguage): string {
    if (lookup.trusted === false && !lookup.primary) return '';
    if (!lookup.primary && lookup.state === 'not-in-deck') return '';
    return `<span><span class="jpdb-reader-state-dot anki-${lookup.state}"></span>Anki ${escapeHtml(cardStateLabel(lookup.state, language))}</span>`;
}

function renderMeta(metaItems: string[]): string {
    return metaItems.length ? `<div class="jpdb-reader-meta">${metaItems.join('')}</div>` : '';
}

function renderMiningGutter(miningActions: string, language: InterfaceLanguage, expanded = false): string {
    const label = uiText(language, expanded ? 'hideMiningActions' : 'showMiningActions');
    return miningActions
        ? `<div class="jpdb-reader-actions-gutter"><button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="${String(expanded)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></button></div>`
        : '';
}

function jitenDeckLabel(deck: { name: string } | undefined): string {
    return deck?.name ? `Jiten: ${deck.name}` : 'Jiten';
}
