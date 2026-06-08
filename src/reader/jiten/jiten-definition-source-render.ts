import { cardHighlightScopeAttributes, renderCardHighlightedTextHtml, type CardHighlightTarget } from '../cards/highlight';
import { JITEN_DEFINITION_SOURCE_ID } from '../app/constants';
import { escapeHtml } from '../dom';
import { speakerIcon } from '../ui/icons';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage, JPDBCard } from '../app/types';
import type { JitenVocabularyDefinition, JitenVocabularyExample, JitenVocabularyInfo, JitenVocabularyReading, JitenVocabularyWordSummary } from '../dictionaries/jiten';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;
interface JitenMeaningGroup {
    partsOfSpeech: string[];
    meanings: string[];
}

interface JitenTextReference {
    text: string;
    reading: string;
    wordId?: number;
    readingIndex?: number;
}

export function renderJitenDefinitionSource(card: JPDBCard, sourceAttributes: SourceAttributes, info: JitenVocabularyInfo | null = null, language: InterfaceLanguage = 'en'): string {
    const meanings = jitenDefinitionMeanings(card, info);
    const extras = renderJitenVocabularyExtras(info, sourceAttributes, language, card);
    if (!meanings && !extras) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card" data-source="jiten" ${cardHighlightScopeAttributes(card)} ${sourceAttributes(definitionSourceStateKey(JITEN_DEFINITION_SOURCE_ID), true)}>
            <summary class="jpdb-reader-local-title">Jiten</summary>
            ${meanings ? `<div class="jpdb-reader-meanings">${meanings}</div>` : ''}
            ${extras}
        </details>
    `;
}

function jitenDefinitionMeanings(card: JPDBCard, info: JitenVocabularyInfo | null): string {
    const groups = jitenDefinitionMeaningGroups(card, info);
    const references = jitenDefinitionTextReferences(card, info);
    let visibleIndex = 0;
    return groups.map(group => {
        const meanings = group.meanings.slice(0, 10).map(meaning => {
            visibleIndex += 1;
            return `<div class="jpdb-reader-meaning jpdb-reader-jiten-meaning">
                ${groups.length > 1 || group.meanings.length > 1 ? `<span class="jpdb-reader-local-sense-index">${visibleIndex}</span>` : ''}
                <span>${renderJitenTextWithReferences(meaning, references)}</span>
            </div>`;
        }).join('');
        if (!meanings) return '';
        return `<div class="jpdb-reader-jiten-meaning-group">${meanings}</div>`;
    }).join('');
}

function jitenDefinitionMeaningGroups(card: JPDBCard, info: JitenVocabularyInfo | null): JitenMeaningGroup[] {
    const definitions = info?.definitions.length
        ? info.definitions.flatMap(definition => jitenDefinitionMeaningTexts(definition).map(meaning => ({ meaning, partsOfSpeech: definition.partsOfSpeech })))
        : card.meanings.map(meaning => ({ meaning: normalizeJitenMeaningText(meaning.glosses.join('; ')), partsOfSpeech: meaning.partOfSpeech }));
    const groups = new Map<string, JitenMeaningGroup>();
    for (const definition of definitions) {
        const meaning = definition.meaning.trim();
        if (!meaning) continue;
        const partsOfSpeech = dedupeText(definition.partsOfSpeech);
        const key = partsOfSpeech.map(normalizedMeaningPartOfSpeech).join('\u0001');
        const group = groups.get(key) ?? { partsOfSpeech, meanings: [] };
        if (!group.meanings.includes(meaning)) group.meanings.push(meaning);
        groups.set(key, group);
    }
    return Array.from(groups.values()).filter(group => group.meanings.length).slice(0, 6);
}

function jitenDefinitionMeaningTexts(definition: JitenVocabularyDefinition): string[] {
    const notes = dedupeText([...definition.field, ...definition.dial, ...definition.misc].map(normalizeJitenMeaningText));
    return definition.meanings
        .map(meaning => [normalizeJitenMeaningText(meaning), ...notes].filter(Boolean).join('; '))
        .filter(Boolean);
}

function normalizeJitenMeaningText(value: string): string {
    return value.replace(/\s+/g, ' ').replace(/;(?=\S)/g, '; ').trim();
}

function normalizedMeaningPartOfSpeech(value: string): string {
    return value.trim().toLocaleLowerCase();
}

function dedupeText(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = value.trim();
        const key = normalizedMeaningPartOfSpeech(text);
        if (!text || seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}

function renderJitenVocabularyExtras(info: JitenVocabularyInfo | null, sourceAttributes: SourceAttributes, language: InterfaceLanguage, card: CardHighlightTarget): string {
    if (!info || (!info.composedOf.length && !info.usedIn.length && !info.examples.length)) return '';
    return `<div class="jpdb-reader-jpdb-extras jpdb-reader-jiten-extras">${renderJitenRelatedWords(info.composedOf, 'jitenCompositeWords', `${JITEN_DEFINITION_SOURCE_ID}:composite`, sourceAttributes, language)}${renderJitenUsedIn(info, sourceAttributes, language)}${renderJitenExamples(info.examples, sourceAttributes, language, card)}</div>`;
}

function renderJitenUsedIn(info: JitenVocabularyInfo, sourceAttributes: SourceAttributes, language: InterfaceLanguage): string {
    const status = info.usedInTotal > info.usedIn.length ? `${info.usedIn.length}/${info.usedInTotal}` : String(info.usedIn.length);
    return info.usedIn.length ? renderJitenRelatedWords(info.usedIn, 'usedInVocabulary', `${JITEN_DEFINITION_SOURCE_ID}:used-in-vocabulary`, sourceAttributes, language, status) : '';
}

function renderJitenRelatedWords(
    entries: JitenVocabularyWordSummary[],
    titleKey: 'jitenCompositeWords' | 'usedInVocabulary',
    stateKey: string,
    sourceAttributes: SourceAttributes,
    language: InterfaceLanguage,
    status = String(entries.length),
): string {
    if (!entries.length) return '';
    return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-used-in-group jpdb-reader-jiten-related-group" ${sourceAttributes(definitionSourceStateKey(stateKey))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, titleKey))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${escapeHtml(status)}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-used-in jpdb-reader-jiten-related-words">
                    ${entries.slice(0, 20).map(entry => renderJitenRelatedWord(entry, language)).join('')}
                </ul>
            </div>
        </details>
    `;
}

function renderJitenRelatedWord(entry: JitenVocabularyWordSummary, language: InterfaceLanguage): string {
    const lookup = cleanJitenWordSurface(entry);
    const reading = jitenAnnotatedKana(entry.readingFurigana) || cleanJitenAnnotatedText(entry.reading);
    return `
        <li class="jpdb-reader-jpdb-used-in-row jpdb-reader-jiten-related-row has-audio">
            ${renderJitenAudioButton(lookup, language, jitenWordAudioAttributes(entry))}
            <span class="jpdb-reader-jpdb-used-in-main jpdb-reader-jiten-related-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link jpdb-reader-jiten-related-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(lookup)}" data-dictionary-reading="${escapeHtml(reading)}" data-dictionary="Jiten" data-external="false">
                    <span class="jpdb-reader-jpdb-compound-head jpdb-reader-jiten-related-head">${renderJitenAnnotatedReading(entry.readingFurigana || entry.reading)}</span>
                </a>
                ${entry.frequencyRank ? `<small>#${escapeHtml(String(entry.frequencyRank))}${entry.mainDefinition ? ` · ${escapeHtml(entry.mainDefinition)}` : ''}</small>` : entry.mainDefinition ? `<small>${escapeHtml(entry.mainDefinition)}</small>` : ''}
            </span>
        </li>
    `;
}

function renderJitenExamples(examples: JitenVocabularyExample[], sourceAttributes: SourceAttributes, language: InterfaceLanguage, card: CardHighlightTarget): string {
    return examples.length ? `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-examples-group" ${sourceAttributes(definitionSourceStateKey(`${JITEN_DEFINITION_SOURCE_ID}:examples`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'exampleSentences'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${examples.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-examples">
                    ${examples.map(example => renderJitenExample(example, card, language)).join('')}
                </ul>
            </div>
        </details>
    ` : '';
}

function renderJitenExample(example: JitenVocabularyExample, card: CardHighlightTarget, language: InterfaceLanguage): string {
    return `
        <li class="jpdb-reader-jpdb-example jpdb-reader-jiten-example">
            <div class="jpdb-reader-jpdb-example-row jpdb-reader-jiten-example-row has-audio">
                ${renderJitenAudioButton(example.text, language, jitenExampleAudioAttributes(example))}
                <div class="jpdb-reader-jpdb-example-text jpdb-reader-jiten-example-text">
                    <div class="jpdb-reader-example-sentence jpdb-reader-jiten-example-sentence jpdb-reader-parseable">${renderJitenExampleSentence(example, card)}</div>
                    ${example.sourceTitle ? `<div class="jpdb-reader-example-translation">${escapeHtml(example.sourceTitle)}</div>` : ''}
                </div>
            </div>
        </li>
    `;
}

function renderJitenExampleSentence(example: JitenVocabularyExample, card: CardHighlightTarget): string {
    if (example.wordPosition < 0 || example.wordLength <= 0) return renderCardHighlightedTextHtml(example.text, card);
    const before = example.text.slice(0, example.wordPosition);
    const target = example.text.slice(example.wordPosition, example.wordPosition + example.wordLength);
    const after = example.text.slice(example.wordPosition + example.wordLength);
    return `${escapeHtml(before)}<mark class="jpdb-reader-example-target jpdb-reader-jiten-example-target">${escapeHtml(target)}</mark>${escapeHtml(after)}`;
}

function renderJitenAudioButton(text: string, language: InterfaceLanguage, extraAttributes = ''): string {
    const audioText = text.trim();
    if (!audioText) return '';
    const label = uiText(language, 'playAudio');
    const attrs = extraAttributes ? ` ${extraAttributes}` : '';
    return `<button class="jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio jpdb-reader-jiten-audio" type="button" data-action="jiten-audio" data-study-sentence="${escapeHtml(audioText)}"${attrs} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${speakerIcon()}</button>`;
}

function renderJitenAnnotatedReading(value: string): string {
    const source = value.trim();
    if (!source) return '';
    let html = '';
    let offset = 0;
    const regex = /([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
        html += escapeHtml(source.slice(offset, match.index));
        html += `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(match[1] ?? '')}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(match[2] ?? '')}</rt><rp>)</rp></ruby>`;
        offset = match.index + match[0].length;
    }
    html += escapeHtml(source.slice(offset));
    return html;
}

function cleanJitenAnnotatedText(value: string): string {
    return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, '$1').trim();
}

function jitenAnnotatedKana(value: string): string {
    const source = value.trim();
    const rendered = source.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, '$2').trim();
    return rendered === source ? '' : rendered;
}

function cleanJitenWordSurface(word: JitenVocabularyWordSummary): string {
    return cleanJitenAnnotatedText(word.matchSurface || word.readingFurigana || word.reading);
}

function jitenWordAudioAttributes(entry: JitenVocabularyWordSummary): string {
    return [
        `data-jiten-word-id="${escapeHtml(String(entry.wordId))}"`,
        `data-jiten-reading-index="${escapeHtml(String(entry.readingIndex))}"`,
        entry.audioUrls?.length ? `data-jiten-audio-urls="${escapeHtml(JSON.stringify(entry.audioUrls))}"` : '',
    ].filter(Boolean).join(' ');
}

function jitenExampleAudioAttributes(example: JitenVocabularyExample): string {
    return [
        example.sentenceId ? `data-jiten-sentence-id="${escapeHtml(String(example.sentenceId))}"` : '',
        example.audioUrls?.length ? `data-jiten-audio-urls="${escapeHtml(JSON.stringify(example.audioUrls))}"` : '',
    ].filter(Boolean).join(' ');
}

function jitenDefinitionTextReferences(card: JPDBCard, info: JitenVocabularyInfo | null): JitenTextReference[] {
    const references = new Map<string, JitenTextReference>();
    const add = (reference: JitenTextReference | null) => {
        if (!reference?.text || references.has(reference.text)) return;
        references.set(reference.text, reference);
    };
    add(jitenCardTextReference(card));
    if (info) {
        add(jitenVocabularyReadingReference(info.mainReading, info.wordId, card.reading));
        info.alternativeReadings.forEach(reading => add(jitenVocabularyReadingReference(reading, info.wordId, card.reading)));
        [...info.composedOf, ...info.usedIn].forEach(word => add(jitenWordSummaryTextReference(word)));
    }
    return Array.from(references.values())
        .filter(reference => hasJapaneseText(reference.text))
        .sort((left, right) => right.text.length - left.text.length);
}

function jitenCardTextReference(card: JPDBCard): JitenTextReference | null {
    const text = card.spelling.trim();
    if (!text) return null;
    return {
        text,
        reading: card.reading.trim(),
        wordId: Number.isFinite(card.jitenWordId) ? card.jitenWordId : card.source === 'jiten' && Number.isFinite(card.vid) ? card.vid : undefined,
        readingIndex: Number.isFinite(card.jitenReadingIndex) ? card.jitenReadingIndex : card.source === 'jiten' && Number.isFinite(card.sid) ? card.sid : undefined,
    };
}

function jitenVocabularyReadingReference(reading: JitenVocabularyReading | null, wordId: number, fallbackReading: string): JitenTextReference | null {
    if (!reading?.text.trim()) return null;
    const text = cleanJitenAnnotatedText(reading.text);
    return {
        text,
        reading: jitenAnnotatedKana(reading.text) || fallbackReading,
        wordId,
        readingIndex: reading.readingIndex,
    };
}

function jitenWordSummaryTextReference(word: JitenVocabularyWordSummary): JitenTextReference | null {
    const text = cleanJitenWordSurface(word);
    if (!text) return null;
    return {
        text,
        reading: jitenAnnotatedKana(word.readingFurigana) || cleanJitenAnnotatedText(word.reading),
        wordId: word.wordId,
        readingIndex: word.readingIndex,
    };
}

function renderJitenTextWithReferences(text: string, references: JitenTextReference[]): string {
    if (!references.length) return escapeHtml(text);
    let html = '';
    let offset = 0;
    while (offset < text.length) {
        const reference = references.find(candidate => text.startsWith(candidate.text, offset));
        if (!reference) {
            html += escapeHtml(text[offset] ?? '');
            offset += 1;
            continue;
        }
        html += renderPassiveJitenReference(reference);
        offset += reference.text.length;
    }
    return html;
}

function renderPassiveJitenReference(reference: JitenTextReference): string {
    const reading = visibleJitenReferenceReading(reference.text, reference.reading);
    const identity = [
        reference.wordId !== undefined ? `data-vid="${escapeHtml(String(reference.wordId))}"` : '',
        reference.readingIndex !== undefined ? `data-sid="${escapeHtml(String(reference.readingIndex))}"` : '',
    ].filter(Boolean).join(' ');
    const readingAttribute = reading ? ` data-reading="${escapeHtml(reading)}"` : '';
    const identityAttributes = identity ? ` ${identity}` : '';
    const classes = `jpdb-reader-word jpdb-reader-passive-word jpdb-reader-parseable${reading ? ' jpdb-reader-has-furi' : ''}`;
    return `<span class="${classes}" data-jpdb-reader-passive="true"${identityAttributes} data-dictionary="Jiten" data-pitch-class="" data-sentence="${escapeHtml(reference.text)}" data-expression="${escapeHtml(reference.text)}"${readingAttribute} tabindex="-1">${renderJitenReferenceContent(reference.text, reading)}</span>`;
}

function renderJitenReferenceContent(text: string, reading: string): string {
    return reading
        ? `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(text)}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(reading)}</rt><rp>)</rp></ruby>`
        : escapeHtml(text);
}

function visibleJitenReferenceReading(text: string, reading: string): string {
    const normalizedText = text.trim();
    const normalizedReading = reading.trim();
    return normalizedReading && normalizedReading !== normalizedText ? normalizedReading : '';
}

function hasJapaneseText(value: string): boolean {
    return /[\u3040-\u30ff\u3400-\u9fff々〆]/u.test(value);
}

function definitionSourceStateKey(sourceId: string): string {
    return `definition-source:${sourceId}`;
}
