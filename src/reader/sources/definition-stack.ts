import { ANKI_SOURCE_ID, BUNPRO_DEFINITION_SOURCE_ID, IMMERSION_KIT_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, WANIKANI_DEFINITION_SOURCE_ID } from '../app/constants';
import { definitionSourceStateKey, renderJpdbDefinitionSource, renderLocalDefinitionSourcesSection } from './definition-render';
import { escapeHtml } from '../dom';
import { uiText } from '../app/i18n';
import { groupTermEntriesByDictionary } from '../dictionaries/groups';
import { isJitenHost } from '../jiten/jiten-page-targets';
import { isJpdbHost } from '../jpdb/jpdb-page-targets';
import { renderJitenDefinitionSource } from '../jiten/jiten-definition-source-render';
import { definitionSourceLabel, orderedDefinitionSourceIds } from './sections';
import type { InterfaceLanguage, JPDBCard, ReaderSettings } from '../app/types';
import type { JitenVocabularyInfo } from '../dictionaries/jiten';
import type { YomitanTermEntry } from '../dictionaries/yomitan';
import type { JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import type { BunproDefinitionInfo } from '../bunpro/definition';
import { yomuBunproCompanion } from '../companions/registry';
import { renderWanikaniDefinitionMount } from '../wanikani/wanikani-source';
import { immersionKitCapabilitiesFor } from './examples/immersion-kit';
import { renderTargetExampleSourceMounts } from './examples/mount';
import { targetLanguageOf } from '../languages/selection';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;
type DictionaryLabel = (name: string) => string;
type DefinitionSourceStackOptionKey = keyof DefinitionSourceStackOptions;
type CoreDefinitionSourceRenderer = (context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams) => string;

export interface DefinitionSourceStackOptions {
    includeJpdbSource?: boolean;
    includeJitenSource?: boolean;
    includeBunproSource?: boolean;
    includeStudySources?: boolean;
    includeImmersionSource?: boolean;
}

interface DefinitionSourceStackContext {
    card: JPDBCard;
    sentence?: string;
    setup: string;
    sourceIds: string[];
    grouped: Map<string, YomitanTermEntry[]>;
    dictionarySourceIds: string[];
    extraSections: Record<string, string>;
    includeJpdbSource: boolean;
    includeJitenSource: boolean;
    includeBunproSource: boolean;
    includeStudySources: boolean;
    includeImmersionSource: boolean;
    jpdbVocabularyInfo: JpdbVocabularyInfo | null;
    jitenVocabularyInfo: JitenVocabularyInfo | null;
    bunproDefinitionInfo: BunproDefinitionInfo | null;
}

export interface RenderDefinitionSourcesStackParams {
    card: JPDBCard;
    entries: YomitanTermEntry[];
    settings: ReaderSettings;
    sourceAttributes: SourceAttributes;
    dictionaryLabel: DictionaryLabel;
    noDefinitionsHtml: () => string;
    sentence?: string;
    jpdbVocabularyInfo?: JpdbVocabularyInfo | null;
    jitenVocabularyInfo?: JitenVocabularyInfo | null;
    bunproDefinitionInfo?: BunproDefinitionInfo | null;
    extraSectionsOrOptions?: Record<string, string> | DefinitionSourceStackOptions;
    optionKeys?: DefinitionSourceStackOptionKey[];
    jpdbLanguage?: InterfaceLanguage;
    setupSource?: (card: JPDBCard) => string;
    renderTranslationSource: (sentence: string | undefined) => string;
    renderGrammarSource: (sentence: string | undefined) => string;
    renderImmersionSource?: () => string;
}

interface DefinitionSourceSectionRender {
    html: string;
    renderedDictionaries: boolean;
}

const DEFAULT_OPTION_KEYS: DefinitionSourceStackOptionKey[] = ['includeJpdbSource', 'includeJitenSource', 'includeBunproSource', 'includeStudySources', 'includeImmersionSource'];
const CORE_DEFINITION_SOURCE_RENDERERS: Record<string, CoreDefinitionSourceRenderer> = {
    [JPDB_DEFINITION_SOURCE_ID]: renderJpdbDefinitionSourceSection,
    [JITEN_DEFINITION_SOURCE_ID]: renderJitenDefinitionSourceSection,
    [BUNPRO_DEFINITION_SOURCE_ID]: renderBunproDefinitionSourceSection,
    [WANIKANI_DEFINITION_SOURCE_ID]: renderWanikaniDefinitionSourceSection,
    [ANKI_SOURCE_ID]: renderAnkiDefinitionSourceSection,
    [STUDY_TRANSLATION_SOURCE_ID]: renderTranslationDefinitionSourceSection,
    [STUDY_GRAMMAR_SOURCE_ID]: renderGrammarDefinitionSourceSection,
    [IMMERSION_KIT_SOURCE_ID]: renderImmersionDefinitionSourceSection,
};

export function renderDefinitionSourcesStack(params: RenderDefinitionSourcesStackParams): string {
    const context = definitionSourceStackContext(params);
    const sections = renderDefinitionSourceSections(context, params);
    return sections.length
        ? `<div class="jpdb-reader-definition-stack">${sections.join('')}</div>`
        : params.noDefinitionsHtml();
}

export function renderDictionarySetupNudge(language: InterfaceLanguage): string {
    return `<aside class="jpdb-reader-dictionary-setup-nudge" data-yomu-finish-setup>
        <span><strong>${escapeHtml(uiText(language, 'finishSetup'))}</strong> ${escapeHtml(uiText(language, 'finishSetupDictionaryHelp'))}</span>
        <button class="jpdb-reader-btn add" type="button" data-action="finish-dictionary-setup">${escapeHtml(uiText(language, 'finishSetup'))}</button>
    </aside>`;
}

export function renderDefinitionSourceImmersionMount(settings: ReaderSettings, sourceAttributes: SourceAttributes): string {
    // U46: this mount used to appear for every TARGET, so a learner reading
    // Spanish got a Japanese anime-subtitle search that could only come back
    // empty. Ask the source whether it covers the target first; when it does
    // not, the target's own example sources render instead, including a visible
    // row for the ones that refuse it.
    //
    // b15: that target check used to sit BEHIND the `immersionKitEnabled` check,
    // so unticking one Japanese anime source deleted Tatoeba — the only example
    // source the other 31 targets have. The toggle governs ImmersionKit, so it is
    // only consulted once ImmersionKit is the thing being rendered.
    if (!immersionKitCapabilitiesFor(targetLanguageOf(settings)).supported) {
        return renderTargetExampleSourceMounts(settings, sourceAttributes);
    }
    if (!settings.immersionKitEnabled) return '';
    const title = definitionSourceLabel(settings, IMMERSION_KIT_SOURCE_ID, uiText(settings.interfaceLanguage, 'immersionKit'));
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${sourceAttributes(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID), false)}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <div class="jpdb-reader-help">${uiText(settings.interfaceLanguage, 'loadingExamples')}</div>
        </details>
    `;
}

function definitionSourceStackContext(params: RenderDefinitionSourcesStackParams): DefinitionSourceStackContext {
    const { options, extraSections } = normalizedDefinitionSourceStackOptions(params);
    const grouped = groupTermEntriesByDictionary(params.entries);
    const sourceIds = orderedDefinitionSourceIds(params.settings, [...grouped.keys()]);
    const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
    return {
        card: params.card,
        sentence: params.sentence,
        setup: params.setupSource?.(params.card) ?? '',
        sourceIds,
        grouped,
        dictionarySourceIds,
        extraSections,
        // A dictionary's own panel is redundant on its own site (the native
        // jpdb.io / jiten.moe page already shows it), so suppress it there by
        // default. Callers can still force it on with an explicit option.
        includeJpdbSource: options.includeJpdbSource ?? !isJpdbHost(),
        includeJitenSource: options.includeJitenSource ?? !isJitenHost(),
        includeBunproSource: options.includeBunproSource ?? !isBunproPageHost(),
        includeStudySources: options.includeStudySources ?? true,
        includeImmersionSource: options.includeImmersionSource ?? true,
        jpdbVocabularyInfo: params.jpdbVocabularyInfo ?? null,
        jitenVocabularyInfo: params.jitenVocabularyInfo ?? null,
        bunproDefinitionInfo: params.bunproDefinitionInfo ?? null,
    };
}

function isBunproPageHost(): boolean {
    if (typeof location === 'undefined') return false;
    return location.hostname === 'bunpro.jp' || location.hostname.endsWith('.bunpro.jp');
}

function normalizedDefinitionSourceStackOptions(params: RenderDefinitionSourcesStackParams): {
    options: DefinitionSourceStackOptions;
    extraSections: Record<string, string>;
} {
    const optionKeys = params.optionKeys ?? DEFAULT_OPTION_KEYS;
    const rawOptions = params.extraSectionsOrOptions ?? {};
    if (isDefinitionSourceStackOptions(rawOptions, optionKeys)) {
        return { options: rawOptions, extraSections: {} };
    }
    return { options: {}, extraSections: rawOptions as Record<string, string> };
}

function isDefinitionSourceStackOptions(
    value: Record<string, string> | DefinitionSourceStackOptions,
    optionKeys: DefinitionSourceStackOptionKey[],
): value is DefinitionSourceStackOptions {
    return optionKeys.some(key => key in value);
}

function renderDefinitionSourceSections(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string[] {
    let renderedDictionaries = false;
    const sections = context.setup ? [context.setup] : [];
    for (const sourceId of context.sourceIds) {
        const rendered = renderDefinitionSourceSection(sourceId, context, params, renderedDictionaries);
        if (rendered.renderedDictionaries) renderedDictionaries = true;
        if (rendered.html) sections.push(rendered.html);
    }
    return sections;
}

function renderDefinitionSourceSection(
    sourceId: string,
    context: DefinitionSourceStackContext,
    params: RenderDefinitionSourcesStackParams,
    renderedDictionaries: boolean,
): DefinitionSourceSectionRender {
    const coreSource = renderCoreDefinitionSourceSection(sourceId, context, params);
    if (coreSource !== null) return { html: coreSource, renderedDictionaries: false };
    if (!context.grouped.has(sourceId)) return { html: '', renderedDictionaries: false };
    if (renderedDictionaries) return { html: '', renderedDictionaries: false };
    return {
        html: renderLocalDefinitionDictionarySources(context, params),
        renderedDictionaries: true,
    };
}

function renderCoreDefinitionSourceSection(
    sourceId: string,
    context: DefinitionSourceStackContext,
    params: RenderDefinitionSourcesStackParams,
): string | null {
    return CORE_DEFINITION_SOURCE_RENDERERS[sourceId]?.(context, params) ?? null;
}

function renderJpdbDefinitionSourceSection(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    if (!context.includeJpdbSource) return '';
    return renderJpdbDefinitionSource(
        context.card,
        params.sourceAttributes,
        context.jpdbVocabularyInfo,
        params.jpdbLanguage,
        definitionSourceLabel(params.settings, JPDB_DEFINITION_SOURCE_ID, 'JPDB'),
    );
}

function renderJitenDefinitionSourceSection(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    if (!context.includeJitenSource) return '';
    return renderJitenDefinitionSource(
        context.card,
        params.sourceAttributes,
        context.jitenVocabularyInfo,
        params.jpdbLanguage ?? params.settings.interfaceLanguage,
        definitionSourceLabel(params.settings, JITEN_DEFINITION_SOURCE_ID, 'Jiten'),
    );
}

function renderBunproDefinitionSourceSection(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    if (!context.includeBunproSource) return '';
    const renderBunproDefinitionSource = yomuBunproCompanion()?.renderBunproDefinitionSource;
    if (!renderBunproDefinitionSource) return '';
    return renderBunproDefinitionSource(
        context.card,
        params.sourceAttributes,
        context.bunproDefinitionInfo,
        params.jpdbLanguage ?? params.settings.interfaceLanguage,
        definitionSourceLabel(params.settings, BUNPRO_DEFINITION_SOURCE_ID, 'Bunpro'),
    );
}

function renderWanikaniDefinitionSourceSection(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    return renderWanikaniDefinitionMount(context.card, params.settings, params.sourceAttributes);
}

function renderAnkiDefinitionSourceSection(context: DefinitionSourceStackContext): string {
    return context.extraSections[ANKI_SOURCE_ID] ?? '';
}

function renderTranslationDefinitionSourceSection(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    return context.includeStudySources ? params.renderTranslationSource(context.sentence) : '';
}

function renderGrammarDefinitionSourceSection(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    return context.includeStudySources ? params.renderGrammarSource(context.sentence) : '';
}

function renderImmersionDefinitionSourceSection(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    return context.includeImmersionSource ? renderImmersionSource(params) : '';
}

function renderLocalDefinitionDictionarySources(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    return renderLocalDefinitionSourcesSection(
        context.dictionarySourceIds,
        context.grouped,
        params.settings,
        params.sourceAttributes,
        params.dictionaryLabel,
        context.card,
    );
}

function renderImmersionSource(params: RenderDefinitionSourcesStackParams): string {
    return params.renderImmersionSource
        ? params.renderImmersionSource()
        : renderDefinitionSourceImmersionMount(params.settings, params.sourceAttributes);
}
