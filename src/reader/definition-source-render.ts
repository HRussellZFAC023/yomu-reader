import { HAS_JAPANESE, escapeHtml } from './dom';
import { uiText } from './i18n';
import { JPDB_DEFINITION_SOURCE_ID } from './constants';
import { KANJI_DICTIONARIES_SOURCE_ID } from './source-sections';
import { bestFrequencyEntries, dictionaryPreferencePriority, hasRichStructuredGlossary, localTermTags, normalizeFrequencyChipValue, pillStyle } from './local-dictionary-display';
import { formatMetaFrequency, groupTermEntriesByHeadword, mergeSimilarKanjiWords, summarizeLearnerGlossary, type LearnerTermGroup } from './popup-render';
import type { InterfaceLanguage, JPDBCard, ReaderSettings } from './types';
import { glossaryToHtml, glossaryToText, type YomitanKanjiEntry, type YomitanMetaEntry, type YomitanTermEntry } from './yomitan';
import type { JpdbKanjiVocabulary } from './jpdb-kanji';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;
type DictionaryLabel = (name: string) => string;

export function renderJpdbDefinitionSource(card: JPDBCard, sourceAttributes: SourceAttributes): string {
    const meanings = card.meanings.slice(0, 6)
        .map(meaning => `<div class="jpdb-reader-meaning">${escapeHtml(meaning.glosses.join('; '))}</div>`)
        .join('');
    if (!meanings) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card" data-source="jpdb" ${sourceAttributes(definitionSourceStateKey(JPDB_DEFINITION_SOURCE_ID))}>
            <summary class="jpdb-reader-local-title">JPDB</summary>
            <div class="jpdb-reader-meanings">${meanings}</div>
        </details>
    `;
}

export function renderLocalDefinitionSourcesSection(
    dictionaries: string[],
    grouped: Map<string, YomitanTermEntry[]>,
    settings: ReaderSettings,
    sourceAttributes: SourceAttributes,
    dictionaryLabel: DictionaryLabel,
    reference?: Pick<JPDBCard, 'spelling' | 'reading'>,
): string {
    const groupsByDictionary = dictionaries
        .map(dictionary => ({ dictionary, groups: groupTermEntriesByHeadword(grouped.get(dictionary) ?? []) }))
        .filter(source => source.groups.length);
    const dictionarySections = groupsByDictionary
        .map(source => renderLocalDictionaryGroup(source.dictionary, source.groups, sourceAttributes, dictionaryLabel, reference))
        .filter(Boolean);
    if (!dictionarySections.length) return '';
    const sourceCount = groupsByDictionary.length;
    const termCount = groupsByDictionary.reduce((count, source) => count + source.groups.length, 0);
    const status = [`${sourceCount} source${sourceCount === 1 ? '' : 's'}`, `${termCount} entr${termCount === 1 ? 'y' : 'ies'}`].join(' · ');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-dictionaries-section" data-source="local-dictionaries" ${sourceAttributes(definitionSourceStateKey('__local_dictionaries__'))}>
            <summary class="jpdb-reader-local-title">
                <span>${uiText(settings.interfaceLanguage, 'dictionaries')}</span>
                <span class="jpdb-reader-source-status">${escapeHtml(status)}</span>
            </summary>
            <div class="jpdb-reader-dictionary-source-list">
                ${dictionarySections.join('')}
            </div>
        </details>
    `;
}

export function renderKanjiDefinitions(
    entries: YomitanKanjiEntry[],
    sourceAttributes: SourceAttributes,
    dictionaryLabel: DictionaryLabel,
): string {
    if (!entries.length) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanji" ${sourceAttributes(kanjiSourceStateKey(KANJI_DICTIONARIES_SOURCE_ID))}>
            <summary class="jpdb-reader-local-title">Kanji dictionaries</summary>
            ${entries.map(entry => `
                <div class="jpdb-reader-local-entry">
                    <div class="jpdb-reader-local-head">
                        <span class="jpdb-reader-kanji-char">${escapeHtml(entry.character)}</span>
                        <span class="jpdb-reader-local-dict">${escapeHtml(dictionaryLabel(entry.dictionary))}</span>
                    </div>
                    <div class="jpdb-reader-kanji-readings">
                        ${entry.onyomi.length ? `<span>On ${escapeHtml(entry.onyomi.join('、'))}</span>` : ''}
                        ${entry.kunyomi.length ? `<span>Kun ${escapeHtml(entry.kunyomi.join('、'))}</span>` : ''}
                    </div>
                    <div class="jpdb-reader-local-glossary jpdb-reader-parseable" data-dictionary="${escapeHtml(entry.dictionary)}">
                        ${entry.meanings.slice(0, 6).map(meaning => `<div>${escapeHtml(meaning)}</div>`).join('')}
                    </div>
                </div>
            `).join('')}
        </details>
    `;
}

export function renderSimilarKanjiWordsShell(
    kanji: string,
    language: InterfaceLanguage,
    sourceStateKey: string,
    sourceOpen: boolean,
    sourceAttributes: SourceAttributes,
): string {
    const help = uiText(language, sourceOpen ? 'loadingSimilarWords' : 'openToLoadSimilarWords');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-similar" data-kanji-similar-words ${sourceAttributes(sourceStateKey)}>
            <summary class="jpdb-reader-local-title">Words using ${escapeHtml(kanji)}</summary>
            <div data-kanji-similar-mount>
                <div class="jpdb-reader-help">${help}</div>
            </div>
        </details>
    `;
}

export function renderSimilarKanjiWordsContent(
    entries: YomitanTermEntry[],
    jpdbVocabulary: JpdbKanjiVocabulary[],
    currentCard: JPDBCard,
    settings: ReaderSettings,
    dictionaryLabel: DictionaryLabel,
): string {
    const words = mergeSimilarKanjiWords(entries, jpdbVocabulary, currentCard, dictionaryLabel).slice(0, settings.similarKanjiWordLimit);
    if (!words.length) return '';
    return `
        <div class="jpdb-reader-similar-grid">
            ${words.map(entry => `
                <button class="jpdb-reader-similar-word" type="button" data-action="similar-word" data-expression="${escapeHtml(entry.expression)}" title="${escapeHtml(entry.source)}${entry.meaning ? `: ${escapeHtml(entry.meaning)}` : ''}">
                    <span class="jpdb-reader-similar-word-head">
                        <span>${escapeHtml(entry.expression)}</span>
                        ${entry.frequency ? `<em>#${entry.frequency}</em>` : ''}
                    </span>
                    ${entry.reading && entry.reading !== entry.expression ? `<small class="jpdb-reader-similar-reading">${escapeHtml(entry.reading)}</small>` : ''}
                    ${entry.meaning ? `<small class="jpdb-reader-similar-meaning">${escapeHtml(entry.meaning)}</small>` : ''}
                </button>
            `).join('')}
        </div>
    `;
}

export function renderFrequencyPills(metaEntries: YomitanMetaEntry[], settings: ReaderSettings, dictionaryLabel: DictionaryLabel): string[] {
    return bestFrequencyEntries(metaEntries)
        .filter(entry => entry.mode === 'freq')
        .sort((a, b) => {
            const priority = dictionaryPreferencePriority(settings, a.dictionary) - dictionaryPreferencePriority(settings, b.dictionary);
            if (priority) return priority;
            return dictionaryLabel(a.dictionary).localeCompare(dictionaryLabel(b.dictionary), 'ja');
        })
        .map(entry => renderFrequencyPill(entry, dictionaryLabel))
        .filter(Boolean)
        .slice(0, 8);
}

export function definitionSourceStateKey(sourceId: string): string {
    return `definition-source:${sourceId}`;
}

export function localDictionaryStateKey(dictionary: string): string {
    return `definition-dictionary:${dictionary}`;
}

export function kanjiSourceStateKey(sourceId: string): string {
    return `kanji:${sourceId}`;
}

function renderLocalDictionaryGroup(dictionary: string, groups: LearnerTermGroup[], sourceAttributes: SourceAttributes, dictionaryLabel: DictionaryLabel, reference?: Pick<JPDBCard, 'spelling' | 'reading'>): string {
    const entryCount = groups.length;
    return `
        <details class="jpdb-reader-dictionary-group" data-dictionary="${escapeHtml(dictionary)}" ${sourceAttributes(localDictionaryStateKey(dictionary))}>
            <summary class="jpdb-reader-local-title jpdb-reader-dictionary-source-title" title="${escapeHtml(dictionaryLabel(dictionary))}">
                <span>${escapeHtml(dictionaryLabel(dictionary))}</span>
                <span class="jpdb-reader-source-status">${entryCount} entr${entryCount === 1 ? 'y' : 'ies'}</span>
            </summary>
            <div class="jpdb-reader-local-terms">
                ${groups.map(group => renderLocalTermGroup(dictionary, group, dictionaryLabel, reference, { showDictionaryTag: false })).join('')}
            </div>
        </details>
    `;
}

function renderLocalTermGroup(dictionary: string, group: LearnerTermGroup, dictionaryLabel: DictionaryLabel, reference?: Pick<JPDBCard, 'spelling' | 'reading'>, options: { showDictionaryTag?: boolean } = {}): string {
    const repeatsLookupHeadword = Boolean(reference)
        && group.expression === reference?.spelling
        && (!reference.reading || group.reading === reference.reading || group.reading === group.expression);
    const tags = localTermTags(group.entries);
    const showDictionaryTag = options.showDictionaryTag ?? true;
    const tagItems = [
        showDictionaryTag ? `<span class="jpdb-reader-dict-tag jpdb-reader-source-tag">${escapeHtml(dictionaryLabel(dictionary))}</span>` : '',
        ...tags.map(tag => `<span class="jpdb-reader-dict-tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`),
    ].filter(Boolean);
    const tagHtml = tagItems.length ? `<div class="jpdb-reader-local-tags">${tagItems.join('')}</div>` : '';
    const showFullGlossary = group.entries.some(hasAdditionalLocalDictionaryText);
    const meaningHtml = showFullGlossary
        ? renderLocalGlossaryEntries(dictionary, group.entries, { showIndex: false })
        : group.meanings.length
        ? `<div class="jpdb-reader-local-senses">
            ${group.meanings.slice(0, 8).map((meaning, index) => `
                <div class="jpdb-reader-local-sense">
                    ${group.meanings.length > 1 ? `<span class="jpdb-reader-local-sense-index">${index + 1}</span>` : ''}
                    <span>${escapeHtml(meaning)}</span>
                </div>
            `).join('')}
        </div>`
        : renderLocalGlossaryEntries(dictionary, group.entries);
    const frequency = group.frequency !== undefined ? `<span class="jpdb-reader-local-frequency">#${escapeHtml(String(group.frequency))}</span>` : '';
    return `
        <article class="jpdb-reader-local-entry jpdb-reader-local-term">
            ${repeatsLookupHeadword ? '' : `<div class="jpdb-reader-local-head">
                <span class="jpdb-reader-local-expression">${escapeHtml(group.expression)}</span>
                ${group.reading && group.reading !== group.expression ? `<span class="jpdb-reader-local-reading">${escapeHtml(group.reading)}</span>` : ''}
                ${frequency}
            </div>`}
            ${tagHtml}
            ${meaningHtml}
        </article>
    `;
}

function renderLocalGlossaryEntries(dictionary: string, entries: YomitanTermEntry[], options: { showIndex?: boolean } = {}): string {
    const showIndex = options.showIndex ?? entries.length > 1;
    const entryHtml = entries.map((entry, index) => {
        const content = entry.glossary.slice(0, 4)
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

function hasAdditionalLocalDictionaryText(entry: YomitanTermEntry): boolean {
    const summary = summarizeLearnerGlossary(entry);
    return entry.glossary.some(item => {
        if (hasRichStructuredGlossary(item)) return true;
        const text = glossaryToText(item).replace(/\s+/g, ' ').trim();
        if (!text || text === summary) return false;
        return HAS_JAPANESE.test(text);
    });
}

function renderFrequencyPill(entry: YomitanMetaEntry, dictionaryLabel: DictionaryLabel): string {
    const label = dictionaryLabel(entry.dictionary);
    const value = normalizeFrequencyChipValue(label, formatMetaFrequency(entry.data));
    return value ? `<span class="jpdb-reader-pill jpdb-reader-frequency-pill" data-dictionary="${escapeHtml(entry.dictionary)}" style="${pillStyle(`frequency:${entry.dictionary}`)}" title="${escapeHtml(label)}">${escapeHtml(label)} ${escapeHtml(value)}</span>` : '';
}
