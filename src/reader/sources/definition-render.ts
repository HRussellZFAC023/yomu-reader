import { HAS_JAPANESE, escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { cardHighlightScopeAttributes, type CardHighlightTarget } from '../cards/highlight';
import { KANJI_DICTIONARIES_SOURCE_ID } from './sections';
import { bestFrequencyEntries, dictionaryPreferencePriority, hasRichStructuredGlossary, localTermTags, normalizeFrequencyChipValue, pillStyle } from '../dictionaries/display';
import { formatMetaFrequency, groupTermEntriesByHeadword, summarizeLearnerGlossary, type LearnerTermGroup } from '../dictionaries/groups';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { glossaryToHtml, glossaryToText, type YomitanKanjiEntry, type YomitanMetaEntry, type YomitanTermEntry } from '../dictionaries/yomitan';

export { renderJpdbDefinitionSource } from '../jpdb/jpdb-definition-source-render';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;
type DictionaryLabel = (name: string) => string;

export function renderLocalDefinitionSourcesSection(
    dictionaries: string[],
    grouped: Map<string, YomitanTermEntry[]>,
    settings: ReaderSettings,
    sourceAttributes: SourceAttributes,
    dictionaryLabel: DictionaryLabel,
    reference?: CardHighlightTarget,
): string {
    const groupsByDictionary = dictionaries
        .map(dictionary => ({ dictionary, groups: groupTermEntriesByHeadword(grouped.get(dictionary) ?? []) }))
        .filter(source => source.groups.length);
    const dictionarySections = groupsByDictionary
        .map(source => renderLocalDictionaryGroup(source.dictionary, source.groups, sourceAttributes, dictionaryLabel, settings.interfaceLanguage, reference))
        .filter(Boolean);
    return dictionarySections.join('');
}

export function renderKanjiDefinitions(
    entries: YomitanKanjiEntry[],
    sourceAttributes: SourceAttributes,
    dictionaryLabel: DictionaryLabel,
    sourceId = KANJI_DICTIONARIES_SOURCE_ID,
    title: string | undefined = undefined,
    language: InterfaceLanguage = 'en',
): string {
    if (!entries.length) return '';
    const heading = title ?? uiText(language, 'kanjiDictionaries');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanji" ${sourceAttributes(kanjiSourceStateKey(sourceId))}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(heading)}</summary>
            ${entries.map(entry => `
                <div class="jpdb-reader-local-entry">
                    <div class="jpdb-reader-local-head">
                        <span class="jpdb-reader-kanji-char">${escapeHtml(entry.character)}</span>
                        <span class="jpdb-reader-local-dict">${escapeHtml(dictionaryLabel(entry.dictionary))}</span>
                    </div>
                    <div class="jpdb-reader-kanji-readings">
                        ${entry.onyomi.length ? `<span>${escapeHtml(uiText(language, 'onReading'))} ${escapeHtml(entry.onyomi.join('、'))}</span>` : ''}
                        ${entry.kunyomi.length ? `<span>${escapeHtml(uiText(language, 'kunReading'))} ${escapeHtml(entry.kunyomi.join('、'))}</span>` : ''}
                    </div>
                    <div class="jpdb-reader-local-glossary jpdb-reader-parseable" data-dictionary="${escapeHtml(entry.dictionary)}">
                        ${entry.meanings.slice(0, 6).map(meaning => `<div>${escapeHtml(meaning)}</div>`).join('')}
                    </div>
                </div>
            `).join('')}
        </details>
    `;
}

export function renderFrequencyPills(metaEntries: YomitanMetaEntry[], settings: ReaderSettings, dictionaryLabel: DictionaryLabel): string[] {
    return bestFrequencyEntries(metaEntries)
        .filter(entry => entry.mode === 'freq')
        .filter(entry => frequencyEntryEnabled(settings, entry.dictionary))
        .sort((a, b) => {
            const priority = dictionaryPreferencePriority(settings, a.dictionary) - dictionaryPreferencePriority(settings, b.dictionary);
            if (priority) return priority;
            return dictionaryLabel(a.dictionary).localeCompare(dictionaryLabel(b.dictionary), 'ja');
        })
        .map(entry => renderFrequencyPill(entry, dictionaryLabel))
        .filter(Boolean)
        .slice(0, 8);
}

function frequencyEntryEnabled(settings: ReaderSettings, dictionary: string): boolean {
    return settings.dictionaryPreferences.find(preference => preference.name === dictionary)?.enabled ?? true;
}

export function definitionSourceStateKey(sourceId: string): string {
    return `definition-source:${sourceId}`;
}

function localDictionaryStateKey(dictionary: string): string {
    return `definition-dictionary:${dictionary}`;
}

export function kanjiSourceStateKey(sourceId: string): string {
    return `kanji:${sourceId}`;
}

// The kanji-fact source cards are branded by provider ("JPDB" / "Jiten") instead
// of a generic "Kanji facts" / "Readings and components" label, so a reader with
// both keys can tell them apart. Shared by the reader popover and the New Tab.
export function kanjiFactProviderTitle(source: 'jpdb' | 'jiten'): string {
    return source === 'jiten' ? 'Jiten' : 'JPDB';
}

function renderLocalDictionaryGroup(dictionary: string, groups: LearnerTermGroup[], sourceAttributes: SourceAttributes, dictionaryLabel: DictionaryLabel, language: InterfaceLanguage, reference?: CardHighlightTarget): string {
    const entryCount = groups.length;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-dictionary-group" data-source="local-dictionary" data-dictionary="${escapeHtml(dictionary)}" ${cardHighlightScopeAttributes(reference)} ${sourceAttributes(localDictionaryStateKey(dictionary))}>
            <summary class="jpdb-reader-local-title jpdb-reader-dictionary-source-title" title="${escapeHtml(dictionaryLabel(dictionary))}" data-jpdb-reader-surface-ignore>
                <span>${escapeHtml(dictionaryLabel(dictionary))}</span>
                <span class="jpdb-reader-source-status">${entryCount} ${escapeHtml(uiText(language, entryCount === 1 ? 'localWordSingular' : 'localWordPlural'))}</span>
            </summary>
            <div class="jpdb-reader-local-terms">
                ${groups.map(group => renderLocalTermGroup(dictionary, group, dictionaryLabel, language, reference, { showDictionaryTag: false })).join('')}
            </div>
        </details>
    `;
}

function renderLocalTermGroup(dictionary: string, group: LearnerTermGroup, dictionaryLabel: DictionaryLabel, language: InterfaceLanguage, reference?: CardHighlightTarget, options: { showDictionaryTag?: boolean } = {}): string {
    return `
        <article class="jpdb-reader-local-entry jpdb-reader-local-term">
            ${renderLocalTermHead(group, reference)}
            ${renderLocalTermTags(dictionary, group, dictionaryLabel, options.showDictionaryTag ?? true, language)}
            ${renderLocalTermMeaning(dictionary, group)}
        </article>
    `;
}

function renderLocalTermHead(group: LearnerTermGroup, reference?: CardHighlightTarget): string {
    if (repeatsLookupHeadword(group, reference)) return '';
    return `<div class="jpdb-reader-local-head">
        <span class="jpdb-reader-local-expression">${escapeHtml(group.expression)}</span>
        ${renderLocalTermReading(group)}
        ${renderLocalTermFrequency(group)}
    </div>`;
}

function repeatsLookupHeadword(group: LearnerTermGroup, reference?: CardHighlightTarget): boolean {
    if (!matchesLookupExpression(group, reference)) return false;
    return matchesLookupReading(group, reference);
}

function matchesLookupExpression(group: LearnerTermGroup, reference?: CardHighlightTarget): reference is CardHighlightTarget {
    if (!reference) return false;
    return group.expression === reference.spelling;
}

function matchesLookupReading(group: LearnerTermGroup, reference: CardHighlightTarget): boolean {
    if (!reference.reading) return true;
    if (group.reading === reference.reading) return true;
    return group.reading === group.expression;
}

function renderLocalTermReading(group: LearnerTermGroup): string {
    return group.reading && group.reading !== group.expression
        ? `<span class="jpdb-reader-local-reading">${escapeHtml(group.reading)}</span>`
        : '';
}

function renderLocalTermTags(dictionary: string, group: LearnerTermGroup, dictionaryLabel: DictionaryLabel, showDictionaryTag: boolean, language: InterfaceLanguage): string {
    const tagItems = [
        showDictionaryTag ? `<span class="jpdb-reader-dict-tag jpdb-reader-source-tag">${escapeHtml(dictionaryLabel(dictionary))}</span>` : '',
        ...localTermTags(group.entries, language).map(tag => `<span class="jpdb-reader-dict-tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`),
    ].filter(Boolean);
    return tagItems.length ? `<div class="jpdb-reader-local-tags">${tagItems.join('')}</div>` : '';
}

function renderLocalTermMeaning(dictionary: string, group: LearnerTermGroup): string {
    if (group.entries.some(hasAdditionalLocalDictionaryText)) return renderLocalGlossaryEntries(dictionary, group.entries, { showIndex: false });
    if (!group.meanings.length) return renderLocalGlossaryEntries(dictionary, group.entries);
    return `<div class="jpdb-reader-local-senses">
        ${group.meanings.slice(0, 8).map((meaning, index) => `
            <div class="jpdb-reader-local-sense">
                ${group.meanings.length > 1 ? `<span class="jpdb-reader-local-sense-index">${index + 1}</span>` : ''}
                <span>${escapeHtml(meaning)}</span>
            </div>
        `).join('')}
    </div>`;
}

function renderLocalTermFrequency(group: LearnerTermGroup): string {
    return group.frequency !== undefined ? `<span class="jpdb-reader-local-frequency">#${escapeHtml(String(group.frequency))}</span>` : '';
}

function renderLocalGlossaryEntries(dictionary: string, entries: YomitanTermEntry[], options: { showIndex?: boolean } = {}): string {
    const showIndex = options.showIndex ?? entries.length > 1;
    const entryHtml = entries.map((entry, index) => {
        const content = localGlossaryItemsForRender(entry.glossary)
            .map(item => glossaryToHtml(item, entry.dictionary, { internalSearchLinks: true }))
            .filter(html => html.replace(/<[^>]+>/g, '').trim() || /<(?:img|table|ruby|a|ul|ol|li)\b/i.test(html))
            .map(html => `<div>${html}</div>`)
            .join('');
        if (!content) return '';
        return `
            <div class="jpdb-reader-local-glossary-entry ${showIndex ? '' : 'no-index'}">
                ${showIndex ? `<span class="jpdb-reader-local-sense-index">${index + 1}</span>` : ''}
                <div>${content}</div>
            </div>
        `;
    }).filter(Boolean).join('');
    if (!entryHtml) return '';
    return `
        <div class="jpdb-reader-local-glossary jpdb-reader-parseable" data-dictionary="${escapeHtml(dictionary)}">
            ${entryHtml}
        </div>
    `;
}

function localGlossaryItemsForRender(glossary: unknown[]): unknown[] {
    const items = new Set<unknown>();
    glossary.slice(0, 4).forEach(item => items.add(item));
    glossary
        .filter(item => hasRichStructuredGlossary(item) || HAS_JAPANESE.test(glossaryToText(item)))
        .forEach(item => items.add(item));
    return Array.from(items);
}

function hasAdditionalLocalDictionaryText(entry: YomitanTermEntry): boolean {
    const summary = summarizeLearnerGlossary(entry);
    return entry.glossary.some(item => {
        if (hasRichStructuredGlossary(item)) return true;
        const text = glossaryToText(item).replace(/\s+/g, ' ').trim();
        if (!text || text === summary) return false;
        return HAS_JAPANESE.test(text);
    });
}

export function renderFrequencyPill(entry: YomitanMetaEntry, dictionaryLabel: DictionaryLabel): string {
    const label = dictionaryLabel(entry.dictionary);
    const value = normalizeFrequencyChipValue(label, formatMetaFrequency(entry.data));
    return value ? `<span class="jpdb-reader-pill jpdb-reader-frequency-pill" data-dictionary="${escapeHtml(entry.dictionary)}" data-frequency-source="local" style="${pillStyle(`frequency:${entry.dictionary}`)}" title="${escapeHtml(`${label} local frequency`)}">${escapeHtml(label)} ${escapeHtml(value)}</span>` : '';
}
