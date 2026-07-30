import {
    BUNPRO_DEFINITION_SOURCE_ID,
    JITEN_DEFINITION_SOURCE_ID,
    JPDB_DEFINITION_SOURCE_ID,
    WANIKANI_DEFINITION_SOURCE_ID,
} from '../app/constants';
import { Logger } from '../app/logger';
import type { ReaderSettings } from '../app/types';
import { escapeHtml, setInnerHtml } from '../dom';
import { dictionaryDefinitionLanguage } from '../dictionaries/definition-language';
import { resolveLanguageProfile, slice1LanguageIdForTag } from '../languages';
import { LOCALE_CATALOGS, resolveLearnerLanguage } from '../locales';
import { translateText } from '../translation/google';

const log = Logger.scope('DefinitionTranslation');
const SOURCE_ID_BY_RENDERED_SOURCE: Readonly<Record<string, string>> = Object.freeze({
    jpdb: JPDB_DEFINITION_SOURCE_ID,
    jiten: JITEN_DEFINITION_SOURCE_ID,
    bunpro: BUNPRO_DEFINITION_SOURCE_ID,
    wanikani: WANIKANI_DEFINITION_SOURCE_ID,
});
const PROVIDER_SOURCE_LANGUAGE: Readonly<Record<string, string>> = Object.freeze({
    jpdb: 'en',
    jiten: 'en',
    bunpro: 'auto',
    wanikani: 'en',
});
const DEFINITION_TRANSLATION_TEXT_SELECTOR = '[data-definition-translation-text]';
const TRANSLATION_TEXT_LIMIT = 1800;
export { dictionaryDefinitionLanguage } from '../dictionaries/definition-language';

export async function installDefinitionTranslationBehaviors(root: ParentNode, settings: ReaderSettings): Promise<void> {
    const profile = resolveLanguageProfile(settings);
    if (!profile.definitionTranslationProviderIds.length) return;
    const enabled = new Set(profile.definitionTranslationProviderIds);
    const outputLanguage = profile.outputLanguage;
    const sources = definitionTranslationSources(root);
    await Promise.all(sources.map(source => translateDefinitionSource(source, enabled, outputLanguage)));
}

interface DefinitionTranslationSource {
    element: HTMLElement;
    sourceId: string;
    sourceLanguage: string;
}

function definitionTranslationSources(root: ParentNode): DefinitionTranslationSource[] {
    return Array.from(root.querySelectorAll<HTMLElement>(DEFINITION_TRANSLATION_TEXT_SELECTOR)).flatMap(element => {
        if (element.dataset.definitionTranslationState) return [];
        const card = element.closest<HTMLDetailsElement>('details.jpdb-reader-source-card[data-source]');
        const renderedSource = card?.dataset.source ?? '';
        const explicitSourceId = element.dataset.definitionTranslationSourceId?.trim() ?? '';
        const dictionary = explicitSourceId || card?.dataset.dictionary?.trim() || element.dataset.dictionary?.trim() || '';
        if (dictionary) return [{
            element,
            sourceId: dictionary,
            sourceLanguage: element.dataset.definitionTranslationSourceLanguage?.trim()
                || dictionaryDefinitionLanguage(dictionary),
        }];
        const sourceId = SOURCE_ID_BY_RENDERED_SOURCE[renderedSource];
        const sourceLanguage = element.dataset.definitionTranslationSourceLanguage?.trim()
            || PROVIDER_SOURCE_LANGUAGE[renderedSource];
        return sourceId && sourceLanguage ? [{ element, sourceId, sourceLanguage }] : [];
    });
}

async function translateDefinitionSource(
    source: DefinitionTranslationSource,
    enabled: ReadonlySet<string>,
    outputLanguage: string,
): Promise<void> {
    if (!enabled.has(source.sourceId)) return;
    if (sameLanguage(source.sourceLanguage, outputLanguage)) return;
    const originalText = source.element.dataset.definitionTranslationPayload?.trim()
        || normalizedDefinitionText(source.element);
    if (!originalText) return;

    source.element.dataset.definitionTranslationState = 'loading';
    try {
        const chunks = splitTranslationText(originalText);
        const translatedChunks: string[] = [];
        for (const chunk of chunks) {
            translatedChunks.push(await translateText(chunk, {
                sourceLanguage: source.sourceLanguage,
                outputLanguage,
            }));
        }
        if (!source.element.isConnected && !source.element.ownerDocument.documentElement.contains(source.element)) return;
        const translated = translatedChunks.filter(Boolean).join('\n\n').trim();
        if (!translated) throw new Error('No definition translation returned.');
        renderTranslatedDefinition(source, outputLanguage, translated);
        source.element.dataset.definitionTranslationState = 'ready';
    } catch (error) {
        log.warn('Automatic definition translation failed; keeping the original definition visible.', error);
        source.element.dataset.definitionTranslationState = 'error';
    }
}

function renderTranslatedDefinition(
    source: DefinitionTranslationSource,
    outputLanguage: string,
    translated: string,
): void {
    const document = source.element.ownerDocument;
    const translation = document.createElement('div');
    translation.className = 'jpdb-reader-definition-translation';
    translation.lang = outputLanguage;
    translation.dir = definitionTextDirection(outputLanguage);
    translation.dataset.definitionTranslation = source.sourceId;
    setInnerHtml(translation, escapeHtml(translated).replaceAll('\n', '<br>'));

    const original = document.createElement('details');
    original.className = 'jpdb-reader-definition-original';
    const summary = document.createElement('summary');
    summary.textContent = originalDefinitionLabel(outputLanguage, source.sourceLanguage);
    const body = document.createElement('div');
    body.className = 'jpdb-reader-definition-original-body';
    source.element.before(translation, original);
    body.append(source.element);
    original.append(summary, body);
}

function normalizedDefinitionText(element: Element): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function splitTranslationText(text: string): string[] {
    if (text.length <= TRANSLATION_TEXT_LIMIT) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > TRANSLATION_TEXT_LIMIT) {
        const candidate = remaining.slice(0, TRANSLATION_TEXT_LIMIT);
        const boundary = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf('。'), candidate.lastIndexOf('. '));
        const end = boundary >= Math.floor(TRANSLATION_TEXT_LIMIT * 0.55) ? boundary + 1 : TRANSLATION_TEXT_LIMIT;
        chunks.push(remaining.slice(0, end).trim());
        remaining = remaining.slice(end).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

function originalDefinitionLabel(outputLanguage: string, sourceLanguage: string): string {
    const locale = resolveLearnerLanguage(outputLanguage);
    const template = LOCALE_CATALOGS[locale.id].messages.originalDefinitionLabel;
    const language = sourceLanguage === 'auto'
        ? 'source'
        : new Intl.DisplayNames([outputLanguage], { type: 'language' }).of(sourceLanguage) ?? sourceLanguage;
    return template.replace('{language}', language);
}

function definitionTextDirection(language: string): 'ltr' | 'rtl' {
    return resolveLearnerLanguage(language).direction;
}

function sameLanguage(sourceLanguage: string, targetLanguage: string): boolean {
    if (sourceLanguage === 'auto') return false;
    const sourceId = slice1LanguageIdForTag(sourceLanguage);
    const targetId = slice1LanguageIdForTag(targetLanguage);
    if (sourceId && targetId) return sourceId === targetId;
    return sourceLanguage.split('-')[0]?.toLowerCase() === targetLanguage.split('-')[0]?.toLowerCase();
}
