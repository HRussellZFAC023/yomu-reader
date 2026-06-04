import { HAS_JAPANESE, escapeHtml } from './dom';
import { uiText } from './i18n';
import { JPDB_DEFINITION_SOURCE_ID } from './constants';
import { cardHighlightScopeAttributes, renderCardHighlightedTextHtml, type CardHighlightTarget } from './card-highlight';
import { KANJI_DICTIONARIES_SOURCE_ID } from './source-sections';
import { bestFrequencyEntries, dictionaryPreferencePriority, hasRichStructuredGlossary, localTermTags, normalizeFrequencyChipValue, pillStyle } from './local-dictionary-display';
import { formatMetaFrequency, groupTermEntriesByHeadword, mergeSimilarKanjiWords, summarizeLearnerGlossary, type LearnerTermGroup } from './local-dictionary-groups';
import { speakerIcon } from './icons';
import type { InterfaceLanguage, JPDBCard, ReaderSettings } from './types';
import { glossaryToHtml, glossaryToText, type YomitanKanjiEntry, type YomitanMetaEntry, type YomitanTermEntry } from './yomitan';
import type { JpdbKanjiVocabulary } from './jpdb-kanji';
import type { JpdbVocabularyInfo } from './jpdb-vocabulary';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;
type DictionaryLabel = (name: string) => string;

export function renderJpdbDefinitionSource(card: JPDBCard, sourceAttributes: SourceAttributes, info: JpdbVocabularyInfo | null = null, language: InterfaceLanguage = 'en'): string {
    const meanings = jpdbDefinitionMeanings(card, info)
        .map(meaning => `<div class="jpdb-reader-meaning">${escapeHtml(meaning)}</div>`)
        .join('');
    const extras = renderJpdbVocabularyExtras(info, sourceAttributes, language, card);
    if (!meanings && !extras) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card" data-source="jpdb" ${cardHighlightScopeAttributes(card)} ${sourceAttributes(definitionSourceStateKey(JPDB_DEFINITION_SOURCE_ID), true)}>
            <summary class="jpdb-reader-local-title">JPDB</summary>
            ${meanings ? `<div class="jpdb-reader-meanings">${meanings}</div>` : ''}
            ${extras}
        </details>
    `;
}

function jpdbDefinitionMeanings(card: JPDBCard, info: JpdbVocabularyInfo | null): string[] {
    if (shouldPreferCardMeanings(card)) return cardDefinitionMeanings(card, info);
    return (info?.meanings ?? []).slice(0, 6);
}

function renderJpdbVocabularyExtras(info: JpdbVocabularyInfo | null, sourceAttributes: SourceAttributes, language: InterfaceLanguage, card: CardHighlightTarget): string {
    if (!hasJpdbVocabularyExtras(info)) return '';
    return `<div class="jpdb-reader-jpdb-extras">${renderJpdbCompounds(info, language)}${renderJpdbUsedInVocabulary(info, sourceAttributes, language)}${renderJpdbExamples(info, sourceAttributes, language, card)}</div>`;
}

function shouldPreferCardMeanings(card: JPDBCard): boolean {
    return card.source !== 'local' && card.source !== 'anki' && card.source !== 'fallback';
}

function cardDefinitionMeanings(card: JPDBCard, info: JpdbVocabularyInfo | null): string[] {
    const cardMeanings = card.meanings.slice(0, 6)
        .map(meaning => meaning.glosses.join('; ').trim())
        .filter(Boolean);
    return cardMeanings.length ? cardMeanings : (info?.meanings ?? []).slice(0, 6);
}

function hasJpdbVocabularyExtras(info: JpdbVocabularyInfo | null): info is JpdbVocabularyInfo {
    return Boolean(info && (info.compounds.length || (info.usedInVocabulary?.length ?? 0) || info.examples.length));
}

function renderJpdbCompounds(info: JpdbVocabularyInfo, language: InterfaceLanguage): string {
    return info.compounds.length ? `
        <section class="jpdb-reader-jpdb-extra">
            <ul class="jpdb-reader-jpdb-compounds">
                ${info.compounds.map(compound => `
                    <li class="jpdb-reader-jpdb-compound-row${compound.audioIds?.length ? ' has-audio' : ''}">
                        ${renderJpdbExampleAudioButton(compound.audioIds, compound.term, language)}
                        <span class="jpdb-reader-jpdb-compound-main">
                            <a
                                class="gloss-link jpdb-reader-jpdb-compound"
                                href="#jpdb-reader-dictionary-lookup"
                                data-dictionary-lookup="${escapeHtml(compound.term)}"
                                data-dictionary-reading="${escapeHtml(compound.reading)}"
                                data-dictionary="JPDB"
                                data-external="false"
                            >
                                <span class="jpdb-reader-jpdb-compound-head">
                                    ${renderJpdbRelatedTerm(compound.term, compound.reading, 'jpdb-reader-jpdb-compound-term')}
                                </span>
                            </a>
                            ${compound.meaning ? `<small>${escapeHtml(compound.meaning)}</small>` : ''}
                        </span>
                    </li>
                `).join('')}
            </ul>
        </section>
    ` : '';
}

function renderJpdbUsedInVocabulary(info: JpdbVocabularyInfo, sourceAttributes: SourceAttributes, language: InterfaceLanguage): string {
    const entries = info.usedInVocabulary ?? [];
    return entries.length ? `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-used-in-group" ${sourceAttributes(definitionSourceStateKey(`${JPDB_DEFINITION_SOURCE_ID}:used-in-vocabulary`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'usedInVocabulary'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${entries.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-used-in">
                ${entries.map(entry => `
                    <li class="jpdb-reader-jpdb-used-in-row${entry.audioIds?.length ? ' has-audio' : ''}">
                        ${renderJpdbExampleAudioButton(entry.audioIds, entry.term, language)}
                        <span class="jpdb-reader-jpdb-used-in-main">
                            <a class="gloss-link jpdb-reader-jpdb-used-in-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(entry.term)}" data-dictionary-reading="${escapeHtml(entry.reading)}" data-dictionary="JPDB" data-external="false"><span class="jpdb-reader-jpdb-compound-head">${renderJpdbUsedInTerm(entry.term, entry.reading, entry.url)}</span></a>
                            ${entry.meaning ? `<small>${escapeHtml(entry.meaning)}</small>` : ''}
                        </span>
                    </li>
                `).join('')}
                </ul>
            </div>
        </details>
    ` : '';
}

function renderJpdbExamples(info: JpdbVocabularyInfo, sourceAttributes: SourceAttributes, language: InterfaceLanguage, card: CardHighlightTarget): string {
    return info.examples.length ? `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-examples-group" ${sourceAttributes(definitionSourceStateKey(`${JPDB_DEFINITION_SOURCE_ID}:examples`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'exampleSentences'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${info.examples.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-examples">
                ${info.examples.map(example => `
                    <li class="jpdb-reader-jpdb-example">
                        <div class="jpdb-reader-jpdb-example-row${example.audioIds?.length ? ' has-audio' : ''}">
                            ${renderJpdbExampleAudioButton(example.audioIds, example.sentence, language)}
                            <div class="jpdb-reader-jpdb-example-text">
                                <div class="jpdb-reader-example-sentence jpdb-reader-parseable">${renderCardHighlightedTextHtml(example.sentence, card)}</div>
                                ${example.translation ? `<div class="jpdb-reader-example-translation">${escapeHtml(example.translation)}</div>` : ''}
                            </div>
                        </div>
                    </li>
                `).join('')}
                </ul>
            </div>
        </details>
    ` : '';
}

function renderJpdbExampleAudioButton(audioIds: string[] | undefined, sentence: string, language: InterfaceLanguage): string {
    const audio = audioIds?.join(',') ?? '';
    const label = uiText(language, 'playJpdbExampleAudio');
    return audio ? `<button class="jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio" type="button" data-action="jpdb-example-audio" data-jpdb-audio="${escapeHtml(audio)}" data-jpdb-example-sentence="${escapeHtml(sentence)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${speakerIcon()}</button>` : '';
}

function renderJpdbRelatedTerm(term: string, reading: string, className: string, extraAttributes = '', showReading = true): string {
    const readingText = visibleJpdbRelatedReading(term, reading);
    const base = `<span class="${escapeHtml(`${className} jpdb-reader-parseable`)}" data-dictionary="JPDB"${extraAttributes}>${escapeHtml(term)}</span>`;
    if (!showReading || !readingText) return base;
    return `<span class="jpdb-reader-jpdb-term-with-reading"><span class="jpdb-reader-furi jpdb-reader-jpdb-term-furi" data-jpdb-reader-surface-ignore="true" aria-hidden="true">${escapeHtml(readingText)}</span>${base}</span>`;
}

function renderJpdbUsedInTerm(term: string, reading: string, url: string): string {
    return `<span class="jpdb-reader-jpdb-compound-term jpdb-reader-jpdb-used-in-term" data-dictionary="JPDB">${renderPassiveJpdbRelatedWord(term, reading, url, { showReading: false })}</span>`;
}

function renderPassiveJpdbRelatedWord(term: string, reading: string, url: string, options: { showReading?: boolean } = {}): string {
    const vid = jpdbVocabularyVidFromUrl(url);
    const identityAttributes = vid === null ? '' : ` data-vid="${vid}" data-sid="0"`;
    const readingAttribute = reading ? ` data-reading="${escapeHtml(reading)}"` : '';
    const visibleReading = options.showReading === false ? '' : visibleJpdbRelatedReading(term, reading);
    const classes = `jpdb-reader-word jpdb-reader-passive-word${visibleReading ? ' jpdb-reader-has-furi' : ''}`;
    const content = visibleReading
        ? `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(term)}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(visibleReading)}</rt><rp>)</rp></ruby>`
        : escapeHtml(term);
    return `<span class="${classes}" data-jpdb-reader-passive="true"${identityAttributes} data-pitch-class="" data-sentence="${escapeHtml(term)}" data-expression="${escapeHtml(term)}"${readingAttribute} tabindex="-1">${content}</span>`;
}

function jpdbVocabularyVidFromUrl(value: string): number | null {
    try {
        const parts = new URL(value, 'https://jpdb.io').pathname.split('/').filter(Boolean);
        if (parts[0] !== 'vocabulary') return null;
        const vid = Number.parseInt(parts[1] ?? '', 10);
        return Number.isFinite(vid) && vid > 0 ? vid : null;
    } catch {
        return null;
    }
}

function visibleJpdbRelatedReading(term: string, reading: string): string {
    const normalizedTerm = term.trim();
    const normalizedReading = reading.trim();
    return normalizedReading && normalizedReading !== normalizedTerm ? normalizedReading : '';
}

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
    if (!dictionarySections.length) return '';
    const sourceCount = groupsByDictionary.length;
    const termCount = groupsByDictionary.reduce((count, source) => count + source.groups.length, 0);
    const status = [
        `${sourceCount} ${uiText(settings.interfaceLanguage, sourceCount === 1 ? 'sourceSingular' : 'sourcePlural')}`,
        `${termCount} ${uiText(settings.interfaceLanguage, termCount === 1 ? 'localWordSingular' : 'localWordPlural')}`,
    ].join(' · ');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-dictionaries-section" data-source="local-dictionaries" ${cardHighlightScopeAttributes(reference)} ${sourceAttributes(definitionSourceStateKey('__local_dictionaries__'))}>
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
    sourceId = KANJI_DICTIONARIES_SOURCE_ID,
    title: string | undefined = undefined,
    language: InterfaceLanguage = 'en',
): string {
    if (!entries.length) return '';
    const heading = title ?? uiText(language, 'kanjiDictionaries');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanji" ${sourceAttributes(kanjiSourceStateKey(sourceId))}>
            <summary class="jpdb-reader-local-title">${escapeHtml(heading)}</summary>
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

export function renderSimilarKanjiWordsShell(
    kanji: string,
    language: InterfaceLanguage,
    sourceStateKey: string,
    sourceOpen: boolean,
    sourceAttributes: SourceAttributes,
    title = uiText(language, 'wordsUsingKanji').replace('{kanji}', kanji),
): string {
    const help = uiText(language, sourceOpen ? 'loadingSimilarWords' : 'openToLoadSimilarWords');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-similar" data-kanji-similar-words ${sourceAttributes(sourceStateKey)}>
            <summary class="jpdb-reader-local-title">${escapeHtml(title)}</summary>
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

function renderLocalDictionaryGroup(dictionary: string, groups: LearnerTermGroup[], sourceAttributes: SourceAttributes, dictionaryLabel: DictionaryLabel, language: InterfaceLanguage, reference?: CardHighlightTarget): string {
    const entryCount = groups.length;
    return `
        <details class="jpdb-reader-dictionary-group" data-dictionary="${escapeHtml(dictionary)}" ${sourceAttributes(localDictionaryStateKey(dictionary))}>
            <summary class="jpdb-reader-local-title jpdb-reader-dictionary-source-title" title="${escapeHtml(dictionaryLabel(dictionary))}">
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

function renderFrequencyPill(entry: YomitanMetaEntry, dictionaryLabel: DictionaryLabel): string {
    const label = dictionaryLabel(entry.dictionary);
    const value = normalizeFrequencyChipValue(label, formatMetaFrequency(entry.data));
    return value ? `<span class="jpdb-reader-pill jpdb-reader-frequency-pill" data-dictionary="${escapeHtml(entry.dictionary)}" style="${pillStyle(`frequency:${entry.dictionary}`)}" title="${escapeHtml(label)}">${escapeHtml(label)} ${escapeHtml(value)}</span>` : '';
}
