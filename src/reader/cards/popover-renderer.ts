import { ACADEMY_SRS_LABEL, ANKI_SOURCE_ID } from '../app/constants';
import { collectAnkiReviewTargetLabels, compactAnkiReviewTargetLabel } from '../anki/review-targets';
import { renderAnkiActionRow, renderAnkiExistingSection, renderAnkiNewCardPreview, renderReviewButtons, reviewButtonGrades } from '../anki/render';
import { normalizeCardStates, primaryCardState } from './state';
import type { CardRenderData } from './render-data';
import { renderDeckChoiceOptions, jpdbDeckLabel } from './deck-choice';
import { renderCardSpellingWithFurigana, renderHeadwordComponentPitchSpans } from './reading-display';
import { escapeHtml, renderRuby } from '../dom/index';
import { renderKanjiDefinitions } from '../sources/definition-render';
import { cardStateLabel, formatUiText, uiText } from '../app/i18n';
import { speakerIcon } from '../ui/icons';
import { loadMiningContext } from '../study/mining-context';
import { yomuKanjiStudyCompanion } from '../companions/registry';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from '../lookup/pos';
import { cardPronunciationReading, headwordComponentPitchSegments, type ExpressionComponentLookup, type ExpressionComponentPitch } from '../popup/render';
import { cardUsesPitchAccentPronunciation, renderPronunciation } from '../popup/pronunciation';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import { apiSrsProviderViewForCard, apiSrsSwitchableProviderIds, isApiSrsProviderEnabled, isBunproMiningCard, type ApiSrsProviderView } from './srs-providers';
import type { InterfaceLanguage, JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import type { JitenVocabularyInfo } from '../dictionaries/jiten';
import { contextOccurrenceCount, hasFrequencyRankEvidence, type ProviderFrequencyRanks } from './frequency-ranks';
import type { BunproDefinitionInfo } from '../bunpro/definition';
import type { JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import { jpdbVocabularyUrl } from '../jpdb/jpdb-vocabulary-url';
import { pillStyle } from '../dictionaries/display';
import type { YomitanMetaEntry, YomitanTermEntry } from '../dictionaries/yomitan';
import { hasBunproFrontendCredential, isBunproFrontendCredentialExpired } from '../settings/api-credential';
import { bunproDefinitionStatusAttributes } from '../bunpro/status-attributes';
import { targetUsesCharacterDictionary } from '../languages/character-lookup';
import { activeContentLanguageAxes } from '../app/target-language-name';

interface MiningActionState {
    isNeverForget: boolean;
    isBlacklisted: boolean;
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
    kind: 'both' | 'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki';
    label: string;
    shortLabel: string;
    gradeProfile: 'standard' | 'bunpro-regular' | 'bunpro-fsrs';
    ankiCardId?: number;
    plainLabel?: string;
}

export interface CardPopoverRendererDependencies {
    getSettings: () => ReaderSettings;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
    renderWordHistory: (language: InterfaceLanguage, trigger: 'modal' | 'hover') => string;
    renderWordPills: (card: JPDBCard, jpdbUrl: string, metaEntries?: YomitanMetaEntry[], overrideQuery?: string, trigger?: 'modal' | 'hover', ankiLookup?: CardRenderData['ankiLookup'], frequencyRanks?: ProviderFrequencyRanks) => string;
    renderDefinitionSources: (card: JPDBCard, entries: YomitanTermEntry[], sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null, jitenVocabularyInfo: JitenVocabularyInfo | null, bunproDefinitionInfo: BunproDefinitionInfo | null, extraSections?: Record<string, string>) => string;
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
        const expressionComponents = this.renderExpressionComponents(card, data, view);
        const definitionSources = this.dependencies.renderDefinitionSources(card, data.localEntries, sentence, data.jpdbVocabularyInfo, data.jitenVocabularyInfo ?? null, data.bunproDefinitionInfo ?? null, {
            [ANKI_SOURCE_ID]: ankiSourceSection,
        });
        const fallbackAnkiSection = ankiSourceSection && !definitionSources.includes('jpdb-reader-anki-existing')
            ? ankiSourceSection
            : '';

        return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body" data-card-popover${bunproDefinitionStatusAttributes(data.bunproDefinitionStatus)}>
                ${this.dependencies.renderWordHistory(view.language, trigger)}
                ${this.renderHeader(card, sentence, data, view, trigger)}
                ${this.renderPartOfSpeech(view)}
                ${expressionComponents}
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
        const miningActions = this.renderApiMiningActions(card, cardStates, language, data, provider);
        const ankiActions = data.loading ? '' : renderAnkiActionRow(data.ankiLookup, settings);
        return {
            cardStates,
            state,
            storedContext: data.loading ? null : loadMiningContext(card.spelling),
            jpdbUrl: jpdbVocabularyUrl(card),
            cardPos: formatPartOfSpeech(card.partOfSpeech),
            cardPosDetails: formatPartOfSpeechDetails(card.partOfSpeech),
            language,
            provider,
            miningActions,
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

    private renderHeader(card: JPDBCard, sentence: string | undefined, data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView, trigger: 'modal' | 'hover'): string {
        const wordPills = this.dependencies.renderWordPills(card, view.jpdbUrl, data.metaEntries, undefined, trigger, data.ankiLookup, data.frequencyRanks);
        const pills = appendWordPill(wordPills, this.renderContextFrequencyPill(card, sentence, data, view.language));
        return `<div class="jpdb-reader-header">
            <div class="jpdb-reader-heading">
                ${this.renderTitleRow(card, data, view)}
                ${pills}
            </div>
            <div class="jpdb-reader-card-tools">
                ${renderPronunciation({
                    card,
                    settings: this.settings(),
                    metaEntries: data.metaEntries,
                    expressionComponents: data.expressionComponents,
                    componentPitches: data.componentPitches,
                    loading: data.loading,
                    dictionaryLabel: name => this.dependencies.dictionaryLabel(name),
                })}
                <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" aria-label="${view.audioButtonTitle}" title="${view.audioButtonTitle}"${view.audioButtonDisabled ? ' disabled' : ''}>${speakerIcon()}</button>
            </div>
        </div>`;
    }

    private renderContextFrequencyPill(
        card: JPDBCard,
        sentence: string | undefined,
        data: CardRenderData & { loading: boolean },
        language: InterfaceLanguage,
    ): string {
        if (data.loading || hasFrequencyRankEvidence(card, data.metaEntries, data.frequencyRanks)) return '';
        const count = contextOccurrenceCount(card, sentence);
        if (!count) return '';
        const label = formatUiText(language, 'contextOccurrences', { count });
        return `<span class="jpdb-reader-pill jpdb-reader-frequency-pill" data-frequency-source="context" style="${pillStyle('frequency:context')}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    }

    private renderTitleRow(card: JPDBCard, data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        // Carry the pitch class on the headword so it shows the same pitch-accent
        // underline as words on the page (the underline CSS keys off jpdb-pitch-*);
        // the card header only showed the pitch graph before, never the underline.
        const pitchTarget = cardUsesPitchAccentPronunciation(card);
        const pitchClass = pitchTarget
            ? getPitchClass(card.pitchAccent ?? [], cardPronunciationReading(card) || card.reading)
            : '';
        const spellingClass = `jpdb-reader-spelling jpdb-${view.state}${pitchClass ? ` jpdb-pitch-${pitchClass}` : ''}`;
        const kanjiNavigation = targetUsesCharacterDictionary()
            ? { enabled: true, label: uiText(view.language, 'showKanji') }
            : undefined;
        const componentSegments = pitchTarget && !pitchClass && !data.loading && this.settings().showPitchAccent
            ? headwordComponentPitchSegments(card, data.expressionComponents ?? [], data.componentPitches ?? [])
            : [];
        const componentSpelling = componentSegments.length
            ? renderHeadwordComponentPitchSpans(card, componentSegments, this.settings(), kanjiNavigation)
            : '';
        const spellingContent = componentSpelling || renderCardSpellingWithFurigana(card, this.settings(), kanjiNavigation);
        const pitchEvidence = componentSpelling ? ' data-pitch-evidence="components"' : '';
        const settings = this.settings();
        const axes = activeContentLanguageAxes(settings);
        const axesLabel = formatUiText(view.language, 'popupLanguageAxes', {
            target: axes.targetName,
            output: axes.outputName,
        });
        const kanjiNavigationAttributes = kanjiNavigation
            ? ` data-jpdb-reader-kanji-nav data-jpdb-reader-kanji-nav-label="${escapeHtml(kanjiNavigation.label)}"`
            : '';
        return `<div class="jpdb-reader-title-row">
            <div class="${spellingClass}" data-yomu-headword data-pitch-class="${pitchClass}"${pitchEvidence}${kanjiNavigationAttributes}>${spellingContent}</div>
            ${renderMeta(view.metaItems)}
            <div class="jpdb-reader-language-axes" data-target-language="${escapeHtml(axes.targetLanguage)}" data-output-language="${escapeHtml(axes.outputLanguage)}">${escapeHtml(axesLabel)}</div>
        </div>`;
    }

    private renderPartOfSpeech(view: CardPopoverRenderView): string {
        return view.cardPos ? `<div class="jpdb-reader-pos" title="${escapeHtml(view.cardPosDetails)}">${escapeHtml(view.cardPos)}</div>` : '';
    }

    private renderExpressionComponents(card: JPDBCard, data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        const components = uniqueExpressionComponents(data.expressionComponents ?? []);
        if (data.loading || !components.length) return '';
        // A lone component equal to the whole spelling is not a decomposition;
        // a lone component from a word + particle entry (実際は → 実際) is.
        if (components.length === 1 && components[0].text === card.spelling.trim()) return '';
        const rows = components.map(component => this.renderExpressionComponent(component, data.componentPitches ?? [])).join('');
        // The breakdown is visually self-explanatory, so the label lives only
        // in the accessibility tree; role=list survives list-style:none.
        return `<div class="jpdb-reader-expression-components">
            <ul class="jpdb-reader-jpdb-used-in jpdb-reader-expression-component-list" role="list" aria-label="${escapeHtml(uiText(view.language, 'composedOf'))}">${rows}</ul>
        </div>`;
    }

    private renderExpressionComponent(component: ExpressionComponentLookup, componentPitches: ExpressionComponentPitch[]): string {
        const reading = component.reading.trim();
        const pitchClass = expressionComponentPitchClass(component, componentPitches);
        const term = renderExpressionComponentTerm(component, pitchClass);
        return `<li class="jpdb-reader-jpdb-used-in-row jpdb-reader-expression-component-row">
            <div class="jpdb-reader-jpdb-used-in-main jpdb-reader-expression-component-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link jpdb-reader-expression-component-link" href="#jpdb-reader-dictionary-lookup" role="button" tabindex="0" data-dictionary-lookup="${escapeHtml(component.text)}" data-dictionary-reading="${escapeHtml(reading)}" data-external="false">
                    ${term}
                </a>
            </div>
        </li>`;
    }

    private renderAnkiExistingSection(data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        return data.loading ? '' : renderAnkiExistingSection(data.ankiLookup, view.storedContext, this.settings(), {
            suppressReviewButtons: Boolean(view.reviewButtons),
            sourceAttributes: (key, initiallyExpanded) => this.dependencies.dictionarySourceAttributes(key, initiallyExpanded),
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
        }, data.ankiFieldTargetPlan);
    }

    private renderActions(view: CardPopoverRenderView): string {
        const hasMiningPanel = Boolean(view.miningActions) && canExpandMiningDrawer();
        const miningPanel = hasMiningPanel ? this.renderMiningPanel(view) : '';
        const hasReviewTargetGutter = reviewButtonsIncludeTargetGutter(view.reviewButtons);
        const hasDrawer = hasMiningPanel || hasReviewTargetGutter;
        const miningClass = hasDrawer
            ? ' jpdb-reader-actions-has-mining jpdb-reader-actions-mining-collapsed'
            : '';
        return `<div class="jpdb-reader-actions${miningClass}">
            ${hasReviewTargetGutter ? '' : renderMiningGutter(miningPanel, view.language)}
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
        card: JPDBCard,
        cardStates: ReturnType<typeof normalizeCardStates>,
        language: InterfaceLanguage,
        data: CardRenderData & { loading: boolean },
        provider: ApiSrsProviderView | null,
    ): string {
        return renderApiMiningActions(this.settings(), card, cardStates, language, data, provider);
    }

    private renderReviewButtons(options: ReviewButtonsRenderOptions): string {
        const { card, cardStates, data, provider, selectedDeckLabel, reviewBlockReason, language } = options;
        const earlyResult = this.reviewButtonsEarlyResult(card, data, reviewBlockReason);
        if (earlyResult !== undefined) return earlyResult;
        const targets = this.popoverReviewTargets(card, data, provider, language);
        if (targets.length) return this.renderTargetedReviewButtons(targets, language, targets.length > 1, this.switchProviderTarget(card, provider));
        if (provider?.id === 'yomu-local' && card.reviewSource === 'jpdb-live') {
            return this.dependencies.renderReviewButtonsFallback?.(card, data) ?? '';
        }
        if (!this.shouldRenderReviewButtons(data, provider, reviewBlockReason)) {
            return this.dependencies.renderReviewButtonsFallback?.(card, data) ?? '';
        }
        return this.renderApiReviewButtons(card, provider, data, cardStates, selectedDeckLabel, language);
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
        card: JPDBCard,
        provider: ApiSrsProviderView | null,
        data: CardRenderData & { loading: boolean },
        cardStates: ReturnType<typeof normalizeCardStates>,
        selectedDeckLabel: string,
        language: InterfaceLanguage,
    ): string {
        return renderReviewButtons(this.settings(), null, {
            targetLabel: provider?.label ?? uiText(language, 'gradeJpdbCardTarget'),
            title: reviewButtonTitle(data, cardStates, selectedDeckLabel, language),
            // Jiten/Anki parity: due-in previews on the popover grade row.
            intervals: card.reviewGradeIntervals,
        });
    }

    private shouldRenderReviewButtons(data: CardRenderData & { loading: boolean }, provider: ApiSrsProviderView | null, reviewBlockReason: string): boolean {
        if (reviewBlockReason || data.loading || !this.settings().enableReviews) return false;
        return this.canReviewWithApiProvider(provider);
    }

    private canReviewWithApiProvider(provider: ApiSrsProviderView | null): boolean {
        const settings = this.settings();
        return Boolean(provider?.hasApiKey && isApiSrsProviderEnabled(settings, provider.id));
    }

    // The next provider the ⇄ toggle would switch to, or null when there is
    // nothing to switch to. Bunpro joins the cycle when the card carries a
    // usable Bunpro identity.
    private switchProviderTarget(card: JPDBCard, provider: ApiSrsProviderView | null): ApiSrsProviderView | null {
        if (!provider || provider.id === 'yomu-local' || !provider.hasApiKey) return null;
        const cycle = apiSrsSwitchableProviderIds(card, this.settings());
        if (cycle.length < 2) return null;
        const next = cycle[(cycle.indexOf(provider.id) + 1) % cycle.length];
        return next && next !== provider.id ? this.providerForReviewTarget({ id: next, kind: next, label: '', shortLabel: '', gradeProfile: 'standard' }, null) : null;
    }

    private popoverReviewTargets(
        card: JPDBCard,
        data: CardRenderData & { loading: boolean },
        provider: ApiSrsProviderView | null,
        language: InterfaceLanguage,
    ): PopoverReviewTarget[] {
        const ankiTargets = this.ankiReviewTargets(data, language);
        if (provider?.id === 'yomu-local' && ankiTargets.length) return ankiTargets;
        const apiTargets = this.apiReviewTargets(card, provider, language);
        if ((provider?.id === 'bunpro' || provider?.id === 'wanikani') && apiTargets.length) return apiTargets;
        if (apiTargets.length && ankiTargets.length) {
            const apiProvider = this.providerForReviewTarget(apiTargets[0], provider);
            if (!apiProvider) return [...apiTargets, ...ankiTargets];
            const primaryAnki = ankiTargets[0];
            return [
                this.bothReviewTarget(apiProvider, primaryAnki, language),
                ...apiTargets,
                ...ankiTargets,
            ];
        }
        if (ankiTargets.length) return ankiTargets;
        return apiTargets;
    }

    private apiReviewTargets(card: JPDBCard, provider: ApiSrsProviderView | null, _language: InterfaceLanguage): PopoverReviewTarget[] {
        // `provider` already reflects the user's chosen grading provider (the
        // target-gutter toggle resolves it via apiSrsProviderViewForCard), so the grade
        // row tracks one API target. Switching providers happens from the gutter
        // toggle, not a second selector here.
        if (provider?.id === 'yomu-local' && card.reviewSource === 'jpdb-live') return [];
        if (provider && this.canReviewWithApiProvider(provider)) return [this.apiReviewTarget(provider, _language, card)];
        return [];
    }

    private providerForReviewTarget(target: PopoverReviewTarget, fallback: ApiSrsProviderView | null): ApiSrsProviderView | null {
        if (target.kind === 'jpdb') return { id: 'jpdb', label: 'JPDB', deckSource: 'jpdb', hasApiKey: true };
        if (target.kind === 'jiten') return { id: 'jiten', label: 'Jiten', deckSource: 'jiten', hasApiKey: true };
        if (target.kind === 'bunpro') return { id: 'bunpro', label: 'Bunpro', deckSource: 'bunpro', hasApiKey: true };
        if (target.kind === 'wanikani') return { id: 'wanikani', label: 'WaniKani', deckSource: 'wanikani', hasApiKey: true };
        if (target.kind === 'yomu-local') return { id: 'yomu-local', label: ACADEMY_SRS_LABEL, deckSource: 'yomu-local', hasApiKey: true };
        return fallback;
    }

    private apiReviewTarget(provider: ApiSrsProviderView, language: InterfaceLanguage, card: JPDBCard): PopoverReviewTarget {
        if (provider.id === 'yomu-local') {
            return {
                id: 'yomu-local',
                kind: 'yomu-local',
                label: uiText(language, 'gradeTargetYomuLocal'),
                shortLabel: provider.label,
                gradeProfile: 'standard',
            };
        }
        if (provider.id === 'bunpro') {
            return {
                id: 'bunpro',
                kind: 'bunpro',
                label: uiText(language, 'gradeTargetBunpro'),
                shortLabel: provider.label,
                gradeProfile: card.bunproReviewInputMode === 'fsrs' ? 'bunpro-fsrs' : 'bunpro-regular',
            };
        }
        if (provider.id === 'wanikani') {
            return {
                id: 'wanikani',
                kind: 'wanikani',
                label: uiText(language, 'gradeTargetWanikani'),
                shortLabel: provider.label,
                gradeProfile: 'standard',
            };
        }
        const isJiten = provider.id === 'jiten';
        return {
            id: provider.id,
            kind: isJiten ? 'jiten' : 'jpdb',
            label: uiText(language, isJiten ? 'gradeTargetJiten' : 'gradeTargetJpdb'),
            shortLabel: provider.label,
            gradeProfile: 'standard',
        };
    }

    private bothReviewTarget(provider: ApiSrsProviderView, ankiTarget: PopoverReviewTarget, language: InterfaceLanguage): PopoverReviewTarget {
        const label = provider.id === 'bunpro'
            ? uiText(language, 'gradeTargetBunproAndAnki')
            : provider.id === 'yomu-local'
                ? uiText(language, 'gradeTargetYomuLocalAndAnki')
                : provider.id === 'jiten'
                ? uiText(language, 'gradeTargetJitenAndAnki')
                : uiText(language, 'gradeTargetJpdbAndAnki');
        return {
            id: 'both',
            kind: 'both',
            label: formatTargetLabel(label, ankiTarget.plainLabel ?? ankiTarget.shortLabel),
            shortLabel: uiText(language, 'gradeTargetBoth'),
            ankiCardId: ankiTarget.ankiCardId,
            gradeProfile: 'standard',
        };
    }

    private ankiReviewTargets(data: CardRenderData & { loading: boolean }, language: InterfaceLanguage): PopoverReviewTarget[] {
        const settings = this.settings();
        if (!settings.enableReviews || !settings.ankiEnabled || !settings.ankiSectionEnabled) return [];
        const orderedNotes = data.ankiLookup.primary
            ? [
                data.ankiLookup.primary,
                ...data.ankiLookup.notes.filter(note => note !== data.ankiLookup.primary),
            ]
            : data.ankiLookup.notes;
        const primary = data.ankiLookup.primary;
        const notes = primary && !data.ankiLookup.notes.includes(primary) ? [...orderedNotes, primary] : orderedNotes;
        return collectAnkiReviewTargetLabels([], notes).map(({ cardId, label }) => ({
            id: `anki:${cardId}`,
            kind: 'anki' as const,
            ankiCardId: cardId,
            plainLabel: label,
            label: formatTargetLabel(uiText(language, 'gradeTargetAnki'), label),
            shortLabel: compactAnkiReviewTargetLabel(label, cardId),
            gradeProfile: 'standard',
        }));
    }

    private renderTargetedReviewButtons(
        targets: PopoverReviewTarget[],
        language: InterfaceLanguage,
        canSwitchTarget: boolean,
        switchProviderTarget: ApiSrsProviderView | null,
    ): string {
        const settings = this.settings();
        const selected = targets[0];
        if (!selected) return '';
        const standardGrades = reviewButtonGrades(settings);
        const bunproRegularGrades: Array<[string, string]> = [
            ['fail', uiText(language, 'bunproGradeHardLabel')],
            ['pass', uiText(language, 'bunproGradeGoodLabel')],
        ];
        const bunproFsrsGrades: Array<[string, string]> = [
            ['nothing', uiText(language, 'bunproGradeAgainLabel')],
            ['hard', uiText(language, 'bunproGradeHardLabel')],
            ['okay', uiText(language, 'bunproGradeGoodLabel')],
            ['easy', uiText(language, 'bunproGradeEasyLabel')],
        ];
        const profiles = new Set(targets.map(target => target.gradeProfile));
        const gradeRows = [
            profiles.has('standard') ? renderTargetedGradeRow(standardGrades, selected, 'standard', selected.gradeProfile !== 'standard') : '',
            profiles.has('bunpro-regular') ? renderTargetedGradeRow(bunproRegularGrades, selected, 'bunpro-regular', selected.gradeProfile !== 'bunpro-regular') : '',
            profiles.has('bunpro-fsrs') ? renderTargetedGradeRow(bunproFsrsGrades, selected, 'bunpro-fsrs', selected.gradeProfile !== 'bunpro-fsrs') : '',
        ].filter(Boolean).join('');
        if (!gradeRows) return '';
        const selector = canSwitchTarget ? renderReviewTargetSelector(targets, language) : '';
        const targetGutter = renderReviewTargetGutter(selected, language, canSwitchTarget, switchProviderTarget);
        return `
            ${targetGutter}
            ${selector}
            ${gradeRows}
        `;
    }

    private renderMetaItems(card: JPDBCard, provider: ApiSrsProviderView | null, state: string, data: CardRenderData & { loading: boolean }): string[] {
        const settings = this.settings();
        const academyBacked = card.source === 'yomu-local' || card.reviewSource === 'yomu-local';
        const canShowProviderStatus = Boolean(provider?.hasApiKey && (provider.id !== 'yomu-local' || academyBacked));
        return [
            shouldRenderMetaFrequencyRank(card, provider, settings) ? renderMetaFrequencyRank(card.frequencyRank!, settings.interfaceLanguage) : '',
            canShowProviderStatus ? `<span class="jpdb-reader-provider-status"><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml(provider?.label ?? 'API')} ${escapeHtml(cardStateLabel(state, settings.interfaceLanguage))}</span>` : '',
            renderAnkiMeta(data.ankiLookup, settings),
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

export function updatePopoverReviewTargetSelection(select: HTMLSelectElement): void {
    const option = select.options[select.selectedIndex] ?? null;
    if (!option) return;
    const actions = select.closest<HTMLElement>('.jpdb-reader-actions');
    if (!actions) return;
    const label = option.dataset.reviewTargetLabel ?? option.textContent?.trim() ?? '';
    const shortLabel = option.dataset.reviewTargetShortLabel ?? option.textContent?.trim() ?? label;
    const target = option.dataset.reviewTarget ?? '';
    const gradeProfile = option.dataset.reviewGradeProfile ?? 'standard';
    const ankiCardId = option.dataset.ankiCardId ?? '';
    const current = actions.querySelector<HTMLElement>('[data-review-target-current]');
    if (current) current.textContent = shortLabel;
    const labelText = actions.querySelector<HTMLElement>('[data-review-target-label] [data-newtab-grade-target-text]');
    if (labelText) labelText.textContent = label;
    actions.querySelectorAll<HTMLElement>('[data-review-grade-profile]').forEach(row => {
        row.hidden = row.dataset.reviewGradeProfile !== gradeProfile;
    });
    actions.querySelectorAll<HTMLButtonElement>('[data-review-target-row] [data-action="grade"][data-grade]').forEach(button => {
        button.dataset.reviewTarget = target;
        button.dataset.newtabReviewTarget = target;
        if (ankiCardId) button.dataset.ankiCardId = ankiCardId;
        else delete button.dataset.ankiCardId;
        const buttonLabel = button.textContent?.trim() ?? '';
        if (label) {
            button.title = label;
            button.setAttribute('aria-label', `${buttonLabel}: ${label}`);
        } else {
            button.removeAttribute('title');
            button.removeAttribute('aria-label');
        }
    });
}

export function popoverUsesBunproGradeScale(root: ParentNode | null | undefined): boolean {
    return popoverBunproGradeMode(root) !== null;
}

export function popoverBunproGradeMode(root: ParentNode | null | undefined): 'regular' | 'fsrs' | null {
    const row = root?.querySelector<HTMLElement>('[data-review-grade-profile^="bunpro-"]:not([hidden])');
    if (row?.dataset.reviewGradeProfile === 'bunpro-fsrs') return 'fsrs';
    return row ? 'regular' : null;
}

function renderTargetedGradeRow(
    grades: Array<[string, string]>,
    selected: PopoverReviewTarget,
    profile: PopoverReviewTarget['gradeProfile'],
    hidden: boolean,
): string {
    const targetLabel = renderReviewTargetLabel(selected);
    const targetAttrs = reviewTargetButtonAttrs(selected);
    return `<div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}" data-review-target-row data-review-grade-profile="${profile}"${hidden ? ' hidden' : ''}>
        ${targetLabel}
        ${grades.map(([grade, label]) => {
            const title = selected.label ? ` title="${escapeHtml(selected.label)}" aria-label="${escapeHtml(`${label}: ${selected.label}`)}"` : '';
            return `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${targetAttrs}${title}>${escapeHtml(label)}</button>`;
        }).join('')}
    </div>`;
}

export function togglePopoverReviewTargetSelection(button: HTMLButtonElement): void {
    const select = button.closest<HTMLElement>('.jpdb-reader-actions')
        ?.querySelector<HTMLSelectElement>('[data-review-target-select]');
    if (!select || select.options.length < 2) return;
    select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
    updatePopoverReviewTargetSelection(select);
}

function reviewButtonsIncludeTargetGutter(reviewButtons: string): boolean {
    return reviewButtons.includes('data-review-target-gutter');
}

function renderReviewTargetGutter(
    target: PopoverReviewTarget,
    language: InterfaceLanguage,
    canSwitchTarget: boolean,
    switchProviderTarget: ApiSrsProviderView | null,
): string {
    const label = uiText(language, 'showMiningActions');
    const switchLabel = uiText(language, 'switchReviewTarget');
    const currentTarget = switchProviderTarget || canSwitchTarget ? renderReviewTargetCurrent(target) : '';
    const targetControl = switchProviderTarget ? renderProviderToggle(switchProviderTarget, language, currentTarget) : currentTarget;
    return `<div class="jpdb-reader-actions-gutter jpdb-reader-review-target-gutter" data-review-target-gutter>
        ${targetControl}
        ${canSwitchTarget ? `<button class="jpdb-reader-review-target-toggle" data-action="review-target-toggle" aria-label="${escapeHtml(switchLabel)}">⇄</button>` : ''}
        <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" data-action="mining-collapse" aria-expanded="false" aria-label="${escapeHtml(label)}"></button>
    </div>`;
}

function renderReviewTargetSelector(targets: PopoverReviewTarget[], language: InterfaceLanguage): string {
    return `<div class="jpdb-reader-mining-panel jpdb-reader-review-target-panel" data-review-target-selector>
        <select class="jpdb-reader-newtab-grade-target-select" data-review-target-select aria-label="${escapeHtml(uiText(language, 'gradeTargetSelector'))}">
            ${targets.map((target, index) => `<option value="${escapeHtml(target.id)}"${index === 0 ? ' selected' : ''} data-review-target="${target.kind}" data-review-grade-profile="${target.gradeProfile}" data-review-target-label="${escapeHtml(target.label)}" data-review-target-short-label="${escapeHtml(target.shortLabel)}"${target.ankiCardId ? ` data-anki-card-id="${target.ankiCardId}"` : ''}>${escapeHtml(target.shortLabel)}</option>`).join('')}
        </select>
    </div>`;
}

function renderReviewTargetCurrent(target: PopoverReviewTarget): string {
    return `<span class="jpdb-reader-review-target-current" data-review-target-current>${escapeHtml(target.shortLabel)}</span>`;
}

function renderReviewTargetLabel(target: PopoverReviewTarget): string {
    return `<div class="jpdb-reader-sr-only jpdb-reader-newtab-sr-only" data-review-target-label><span data-newtab-grade-target-text>${escapeHtml(target.label)}</span></div>`;
}

function reviewTargetButtonAttrs(target: PopoverReviewTarget): string {
    return ` data-review-target="${target.kind}" data-newtab-review-target="${target.kind}"${target.ankiCardId ? ` data-anki-card-id="${target.ankiCardId}"` : ''}`;
}

function formatTargetLabel(template: string, target: string): string {
    return template.replaceAll('{target}', target);
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
        neverForgetLabel: isNeverForget ? uiText(language, 'forget') : uiText(language, 'never'),
        blacklistLabel: isBlacklisted ? uiText(language, 'unlist') : uiText(language, 'blacklist'),
    };
}

function renderApiMiningActions(
    settings: ReaderSettings,
    card: JPDBCard,
    cardStates: ReturnType<typeof normalizeCardStates>,
    language: InterfaceLanguage,
    data: CardRenderData & { loading: boolean },
    provider: ApiSrsProviderView | null,
): string {
    const state = miningActionState(cardStates, language);
    const addDeckSelect = renderAddDeckSelect(settings, card, data, language, provider);
    if (!addDeckSelect && !canRenderApiMiningActions(settings, provider)) return '';
    return renderApiMiningActionDetails(language, state, addDeckSelect, provider, canToggleApiDeckState(card, settings));
}

// Mirrors changeProviderDeckState's resolution: Never forget / Blacklist land
// on a provider that backs the card AND supports deck states (jpdb, jiten).
// Rendering them for e.g. Bunpro-only cards produced buttons whose only
// possible outcome was an error toast.
function canToggleApiDeckState(card: JPDBCard, settings: ReaderSettings): boolean {
    return apiSrsSwitchableProviderIds(card, settings).some(id => id === 'jpdb' || id === 'jiten');
}

function canRenderApiMiningActions(settings: ReaderSettings, provider: ApiSrsProviderView | null): boolean {
    return Boolean(provider?.hasApiKey && isApiSrsProviderEnabled(settings, provider.id));
}

function renderAddDeckSelect(
    settings: ReaderSettings,
    card: JPDBCard,
    data: CardRenderData & { loading: boolean },
    language: InterfaceLanguage,
    provider: ApiSrsProviderView | null,
): string {
    const deckOptions = renderDeckChoiceOptions(settings, data.jpdbDecks, data.ankiDecks, {
        includeJpdb: provider?.id === 'jpdb',
        includeJiten: provider?.id === 'jiten',
        includeBunpro: isBunproMiningCard(card)
            && settings.bunproMiningEnabled
            && hasBunproFrontendCredential(settings)
            && !isBunproFrontendCredentialExpired(settings),
        includeYomuLocal: settings.yomuLocalSrsEnabled,
        jitenDecks: data.jitenDecks ?? [],
    });
    if (!deckOptions) return '';
    return `<select class="jpdb-reader-add-deck-select" data-add-deck-select aria-label="${escapeHtml(uiText(language, 'deck'))}" hidden>${deckOptions}</select>`;
}

function renderApiMiningActionDetails(language: InterfaceLanguage, state: MiningActionState, addDeckSelect: string, provider: ApiSrsProviderView | null, canToggleDeckState: boolean): string {
    const addToDeckLabel = `${uiText(language, 'addToDeck')} +`;
    const directAdd = (provider?.id === 'bunpro' || provider?.id === 'yomu-local')
        && (addDeckSelect.match(/data-deck-source=/g)?.length ?? 0) <= 1;
    const directDeckSource = provider?.id === 'bunpro' ? 'bunpro' : provider?.id === 'yomu-local' ? 'yomu-local' : '';
    // Jiten now follows the same Add to deck / Never forget / Blacklist pattern
    // as JPDB; its old Mining/Suspended/Forget row was removed.
    const deckStateButtons = canToggleDeckState
        ? `
                        <button class="jpdb-reader-btn nf${state.isNeverForget ? ' danger' : ''}" data-action="neverforget" aria-pressed="${state.isNeverForget}">${state.neverForgetLabel}</button>
                        <button class="jpdb-reader-btn blacklist" data-action="blacklist" aria-pressed="${state.isBlacklisted}">${state.blacklistLabel}</button>`
        : '';
    return `
                <div class="jpdb-reader-mining-details" role="group" aria-label="${escapeHtml(uiText(language, 'deckActions'))}">
                    <div class="jpdb-reader-row jpdb-reader-mining-action-row" style="--cols: ${canToggleDeckState ? 3 : 1}">
                        <button class="jpdb-reader-btn add jpdb-reader-mining-title" data-action="${directAdd ? 'add' : 'deck-picker'}"${directAdd ? ` data-deck-source="${directDeckSource}"` : ''} aria-expanded="false">${escapeHtml(addToDeckLabel)}</button>${deckStateButtons}
                    </div>
                    ${addDeckSelect}
                </div>
            `;
}

function renderMetaFrequencyRank(rank: number, language: InterfaceLanguage): string {
    const label = uiText(language, 'factFrequency');
    const value = `#${rank}`;
    return `<span class="jpdb-reader-pill jpdb-reader-frequency-pill jpdb-reader-meta-pill" data-dictionary="JPDB" style="${pillStyle('frequency:JPDB')}" title="${escapeHtml(label)}" aria-label="${escapeHtml(`${label}: ${value}`)}">${escapeHtml(value)}</span>`;
}

function shouldRenderMetaFrequencyRank(card: JPDBCard, provider: ApiSrsProviderView | null, settings: ReaderSettings): boolean {
    void card;
    void provider;
    void settings;
    return false;
}

function renderAnkiMeta(lookup: CardRenderData['ankiLookup'], settings: ReaderSettings): string {
    if (!settings.ankiEnabled) return '';
    if (lookup.trusted === false && !lookup.primary) return '';
    if (!lookup.primary && lookup.state === 'not-in-deck') return '';
    const language = settings.interfaceLanguage;
    return `<span><span class="jpdb-reader-state-dot anki-${lookup.state}"></span>Anki ${escapeHtml(cardStateLabel(lookup.state, language))}</span>`;
}

function renderMeta(metaItems: string[]): string {
    return metaItems.length ? `<div class="jpdb-reader-meta">${metaItems.join('')}</div>` : '';
}

function appendWordPill(wordPills: string, pill: string): string {
    if (!pill) return wordPills;
    const closingTag = wordPills.includes('jpdb-reader-word-pills') ? wordPills.lastIndexOf('</div>') : -1;
    return closingTag >= 0
        ? `${wordPills.slice(0, closingTag)}${pill}${wordPills.slice(closingTag)}`
        : `${wordPills}<div class="jpdb-reader-word-pills">${pill}</div>`;
}

function uniqueExpressionComponents(components: ExpressionComponentLookup[]): ExpressionComponentLookup[] {
    const seen = new Set<string>();
    return components.filter(component => {
        const key = `${component.text}\n${component.reading}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function expressionComponentPitchClass(component: ExpressionComponentLookup, componentPitches: ExpressionComponentPitch[]): string {
    // Exact text+reading first; fall back to text-only so a kana-variant
    // reading mismatch does not strip the component's pitch colouring.
    const match = componentPitches.find(pitch => pitch.text === component.text && pitch.reading === component.reading)
        ?? componentPitches.find(pitch => pitch.text === component.text);
    return match ? getPitchClass([match.pitch], match.reading) : '';
}

function renderExpressionComponentTerm(component: ExpressionComponentLookup, pitchClass: string): string {
    const text = component.text.trim();
    const reading = component.reading.trim();
    const classes = [
        'jpdb-reader-word',
        'jpdb-reader-passive-word',
        'jpdb-reader-expression-component-term',
        'jpdb-reader-jpdb-used-in-term',
        reading && reading !== text ? 'jpdb-reader-has-furi' : '',
        pitchClass ? `jpdb-pitch-${pitchClass}` : 'jpdb-pitch-unknown',
    ].filter(Boolean).join(' ');
    const pitchAttribute = pitchClass || 'unknown';
    const readingAttribute = reading ? ` data-reading="${escapeHtml(reading)}"` : '';
    const content = reading && reading !== text
        ? renderRuby(text, expressionComponentRubyToken(text, reading, pitchClass))
        : escapeHtml(text);
    return `<span class="${classes}" data-jpdb-reader-passive="true" data-pitch-class="${escapeHtml(pitchAttribute)}" data-sentence="${escapeHtml(text)}" data-expression="${escapeHtml(text)}"${readingAttribute} tabindex="-1">${content}</span>`;
}

function expressionComponentRubyToken(text: string, reading: string, pitchClass: string): JPDBToken {
    return {
        card: {
            vid: 0,
            sid: 0,
            rid: 0,
            spelling: text,
            reading,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
        } as JPDBCard,
        start: 0,
        end: text.length,
        length: text.length,
        rubies: [],
        pitchClass,
        sentence: text,
    };
}

// Shown next to the grade target when the word can be graded by more than one
// connected SRS (JPDB / Jiten / Bunpro): a one-tap switch for which service the
// deck and grade buttons act on.
function renderProviderToggle(nextProvider: ApiSrsProviderView, language: InterfaceLanguage, content = ''): string {
    const label = `${uiText(language, 'switchGradingProvider')} (${nextProvider.label})`;
    return `<button class="jpdb-reader-provider-toggle" data-action="grade-provider-toggle" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">⇄ ${content}</button>`;
}

// The drawer's expand/collapse behaviour ships in the kanji-study companion;
// without it the collapsed handle is a dead pill that can never reveal any
// mining option, so the drawer only renders when it can actually open.
function canExpandMiningDrawer(): boolean {
    return Boolean(yomuKanjiStudyCompanion()?.setMiningControlsExpanded);
}

function renderMiningGutter(miningActions: string, language: InterfaceLanguage): string {
    const label = uiText(language, 'showMiningActions');
    return miningActions
        ? `<div class="jpdb-reader-actions-gutter"><button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" data-action="mining-collapse" aria-expanded="false" aria-label="${escapeHtml(label)}"></button></div>`
        : '';
}

function jitenDeckLabel(deck: { name: string } | undefined): string {
    return deck?.name ? `Jiten: ${deck.name}` : 'Jiten';
}
