import { ANKI_SOURCE_ID, IMMERSION_KIT_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID } from '../app/constants';
import { definitionSourceStateKey, renderJpdbDefinitionSource, renderLocalDefinitionSourcesSection } from './definition-render';
import { uiText } from '../app/i18n';
import { groupTermEntriesByDictionary } from '../dictionaries/groups';
import { renderJitenDefinitionSource } from '../jiten/jiten-definition-source-render';
import { orderedDefinitionSourceIds } from './sections';
import type { InterfaceLanguage, JPDBCard, ReaderSettings } from '../app/types';
import type { JitenVocabularyInfo } from '../dictionaries/jiten';
import type { YomitanTermEntry } from '../dictionaries/yomitan';
import type { JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;
type DictionaryLabel = (name: string) => string;
type DefinitionSourceStackOptionKey = keyof DefinitionSourceStackOptions;
type CoreDefinitionSourceRenderer = (context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams) => string;

export interface DefinitionSourceStackOptions {
    includeJpdbSource?: boolean;
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
    includeStudySources: boolean;
    includeImmersionSource: boolean;
    jpdbVocabularyInfo: JpdbVocabularyInfo | null;
    jitenVocabularyInfo: JitenVocabularyInfo | null;
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

const DEFAULT_OPTION_KEYS: DefinitionSourceStackOptionKey[] = ['includeJpdbSource', 'includeStudySources', 'includeImmersionSource'];
const CORE_DEFINITION_SOURCE_RENDERERS: Record<string, CoreDefinitionSourceRenderer> = {
    [JPDB_DEFINITION_SOURCE_ID]: renderJpdbDefinitionSourceSection,
    [JITEN_DEFINITION_SOURCE_ID]: renderJitenDefinitionSourceSection,
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

export function renderDefinitionSourceImmersionMount(settings: ReaderSettings, sourceAttributes: SourceAttributes): string {
    if (!settings.immersionKitEnabled) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${sourceAttributes(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID), false)}>
            <summary class="jpdb-reader-local-title">${uiText(settings.interfaceLanguage, 'immersionKit')}</summary>
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
        includeJpdbSource: options.includeJpdbSource ?? true,
        includeStudySources: options.includeStudySources ?? true,
        includeImmersionSource: options.includeImmersionSource ?? true,
        jpdbVocabularyInfo: params.jpdbVocabularyInfo ?? null,
        jitenVocabularyInfo: params.jitenVocabularyInfo ?? null,
    };
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
    );
}

function renderJitenDefinitionSourceSection(context: DefinitionSourceStackContext, params: RenderDefinitionSourcesStackParams): string {
    return renderJitenDefinitionSource(
        context.card,
        params.sourceAttributes,
        context.jitenVocabularyInfo,
        params.jpdbLanguage ?? params.settings.interfaceLanguage,
    );
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
