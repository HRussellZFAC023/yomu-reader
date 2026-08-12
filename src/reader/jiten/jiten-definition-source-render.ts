import { cardHighlightScopeAttributes, renderCardHighlightedTextHtml, type CardHighlightTarget } from '../cards/highlight';
import { JITEN_DEFINITION_SOURCE_ID } from '../app/constants';
import { escapeHtml } from '../dom';
import { speakerIcon } from '../ui/icons';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage, JPDBCard } from '../app/types';
import type { JitenVocabularyDefinition, JitenVocabularyExample, JitenVocabularyInfo, JitenVocabularyReading, JitenVocabularyWordSummary } from '../dictionaries/jiten';
import { renderProviderExamples, type ProviderExampleView } from '../sources/provider-examples';
import { renderAnnotatedReadingRuby, renderPassiveReference } from '../sources/passive-reference';
import { privateCommandAttributes, type CardCommandCapability } from '../dom/private-command-capabilities';

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

interface RenderJitenReferenceOptions {
    className?: string;
    sentence?: string;
    // Per-kanji annotated reading (e.g. "読[よ]み取[と]る"); when present the
    // ruby is distributed per kanji instead of one rt over the whole word.
    annotatedReading?: string;
}

export function renderJitenDefinitionSource(
    card: JPDBCard,
    sourceAttributes: SourceAttributes,
    info: JitenVocabularyInfo | null = null,
    language: InterfaceLanguage = 'en',
    title = 'Jiten',
): string {
    const meanings = jitenDefinitionMeanings(card, info);
    const extras = renderJitenVocabularyExtras(info, sourceAttributes, language, card);
    if (info && !meanings && !extras) return '';
    const hasDetails = Boolean(meanings || extras);
    if (!hasDetails) return '';
    const headword = renderJitenDefinitionHeadword(card, info);
    const body = `${headword}${meanings ? `<div class="jpdb-reader-meanings" data-definition-translation-text>${meanings}</div>` : ''}${extras}`;
    if (!body.trim()) return '';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card" data-source="jiten" ${cardHighlightScopeAttributes(card)} ${sourceAttributes(definitionSourceStateKey(JITEN_DEFINITION_SOURCE_ID), true)}>
            <summary class="jpdb-reader-local-title">${escapeHtml(title)}</summary>
            ${body}
        </details>
    `;
}

function renderJitenDefinitionHeadword(card: JPDBCard, info: JitenVocabularyInfo | null): string {
    const reference = jitenDefinitionHeadwordReference(card, info);
    if (!reference) return '';
    // mainReading.text is furigana-annotated (e.g. "以[い]前[ぜん]"); pass it so
    // the ruby is distributed per kanji instead of the bracket form leaking
    // into the base text under the reading.
    const annotatedReading = info?.mainReading?.text.trim() ?? '';
    return `<div class="jpdb-reader-jiten-headword">${renderPassiveJitenReference(reference, { className: 'jpdb-reader-jiten-headword-target', annotatedReading })}</div>`;
}

function jitenDefinitionHeadwordReference(card: JPDBCard, info: JitenVocabularyInfo | null): JitenTextReference | null {
    const rawText = (info?.mainReading?.text || card.spelling || card.reading).trim();
    const text = cleanJitenAnnotatedText(rawText);
    if (!text || !hasJapaneseText(text)) return null;
    return {
        text,
        reading: jitenAnnotatedKana(rawText) || card.reading || text,
        wordId: info?.wordId ?? card.jitenWordId,
        readingIndex: info?.mainReading?.readingIndex ?? card.jitenReadingIndex,
    };
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
        : isJitenDefinitionCard(card)
            ? card.meanings.map(meaning => ({ meaning: normalizeJitenMeaningText(meaning.glosses.join('; ')), partsOfSpeech: meaning.partOfSpeech }))
            : [];
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

function isJitenDefinitionCard(card: JPDBCard): boolean {
    return card.source === 'jiten'
        || (Number.isFinite(card.jitenWordId) && Number.isFinite(card.jitenReadingIndex));
}

// JMdict orthography-form codes describe how a word is written, not what it
// means (e.g. "uk" = usually written using kana alone). They're noise in a
// meaning list — and redundant with the kana headword — so drop them.
const JITEN_ORTHOGRAPHY_NOTES = new Set(['uk', 'rk', 'ok', 'ik', 'io', 'ateji', 'gikun']);

function jitenDefinitionMeaningTexts(definition: JitenVocabularyDefinition): string[] {
    const notes = dedupeText([...definition.field, ...definition.dial, ...definition.misc].map(normalizeJitenMeaningText))
        .filter(note => !JITEN_ORTHOGRAPHY_NOTES.has(note.toLowerCase()));
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
    return `<div class="jpdb-reader-jpdb-extras jpdb-reader-jiten-extras">${renderJitenRelatedWords(info.composedOf, 'jitenCompositeWords', `${JITEN_DEFINITION_SOURCE_ID}:composite`, sourceAttributes, language)}${renderJitenUsedIn(info, sourceAttributes, language)}${renderJitenExamples(info.examples, sourceAttributes, language, card, info)}</div>`;
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
    const reading = jitenRelatedWordReading(entry);
    return `
        <li class="jpdb-reader-jpdb-used-in-row jpdb-reader-jiten-related-row has-audio">
            ${renderJitenAudioButton(lookup, language, jitenWordAudioAttributes(entry), { kind: 'card-action', action: 'jiten-audio', sentence: lookup, audioUrls: entry.audioUrls, jitenWordId: entry.wordId, jitenReadingIndex: entry.readingIndex })}
            <span class="jpdb-reader-jpdb-used-in-main jpdb-reader-jiten-related-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link jpdb-reader-jiten-related-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(lookup)}" data-dictionary-reading="${escapeHtml(reading)}" data-dictionary="Jiten" data-external="false">
                    <span class="jpdb-reader-jpdb-compound-head jpdb-reader-jiten-related-head">${renderJitenRelatedReference(entry, lookup, reading)}</span>
                </a>
                ${renderJitenRelatedMeta(entry)}
            </span>
        </li>
    `;
}

function jitenRelatedWordReading(entry: JitenVocabularyWordSummary): string {
    return jitenAnnotatedKana(entry.readingFurigana) || cleanJitenAnnotatedText(entry.reading);
}

function renderJitenRelatedReference(entry: JitenVocabularyWordSummary, lookup: string, reading: string): string {
    const reference = renderPassiveJitenReference({
        text: lookup,
        reading,
        wordId: entry.wordId,
        readingIndex: entry.readingIndex,
    }, { annotatedReading: entry.readingFurigana });
    return reference || renderJitenAnnotatedReading(entry.readingFurigana || entry.reading);
}

function renderJitenRelatedMeta(entry: JitenVocabularyWordSummary): string {
    if (!entry.frequencyRank) return renderJitenRelatedDefinition(entry.mainDefinition);
    const definition = entry.mainDefinition ? ` · ${escapeHtml(entry.mainDefinition)}` : '';
    return `<small>#${escapeHtml(String(entry.frequencyRank))}${definition}</small>`;
}

function renderJitenRelatedDefinition(definition: string | undefined): string {
    return definition ? `<small>${escapeHtml(definition)}</small>` : '';
}

function renderJitenExamples(examples: JitenVocabularyExample[], sourceAttributes: SourceAttributes, language: InterfaceLanguage, card: CardHighlightTarget, info: JitenVocabularyInfo): string {
    if (!examples.length) return '';
    const items: ProviderExampleView[] = examples.map((example, index) => ({
        id: String(example.sentenceId ?? index),
        sentence: example.text,
        sentenceHtml: renderJitenExampleSentence(example, card, info),
        translation: example.translation,
        itemClassName: 'jpdb-reader-jiten-example',
        rowClassName: 'jpdb-reader-jiten-example-row',
        textClassName: 'jpdb-reader-jiten-example-text',
        sentenceClassName: 'jpdb-reader-jiten-example-sentence',
        audio: {
            action: 'jiten-audio',
            label: uiText(language, 'playAudio'),
            className: 'jpdb-reader-jiten-audio',
            attributes: {
                'data-study-sentence': example.text.trim(),
                ...(example.sentenceId ? { 'data-jiten-sentence-id': String(example.sentenceId) } : {}),
                ...(example.audioUrls?.length ? { 'data-jiten-audio-urls': JSON.stringify(example.audioUrls) } : {}),
            },
        },
    }));
    return renderProviderExamples('jiten', JITEN_DEFINITION_SOURCE_ID, { availability: 'loaded', items }, sourceAttributes, language);
}

function renderJitenExampleSentence(example: JitenVocabularyExample, card: CardHighlightTarget, info: JitenVocabularyInfo): string {
    const range = jitenExampleTargetRange(example, card, info);
    if (!range) return renderCardHighlightedTextHtml(example.text, card);
    const before = example.text.slice(0, range.start);
    const target = example.text.slice(range.start, range.end);
    const after = example.text.slice(range.end);
    const reference = jitenExampleTargetReference(target, card, info);
    const targetHtml = reference
        ? renderPassiveJitenReference(reference, { className: 'jpdb-reader-example-target jpdb-reader-jiten-example-target', sentence: example.text })
        : `<mark class="jpdb-reader-example-target jpdb-reader-jiten-example-target">${escapeHtml(target)}</mark>`;
    return `${escapeHtml(before)}${targetHtml}${escapeHtml(after)}`;
}

function renderJitenAudioButton(text: string, language: InterfaceLanguage, extraAttributes = '', command?: CardCommandCapability): string {
    const audioText = text.trim();
    if (!audioText) return '';
    const label = uiText(language, 'playAudio');
    const attrs = extraAttributes ? ` ${extraAttributes}` : '';
    return `<button class="jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio jpdb-reader-jiten-audio" type="button" data-action="jiten-audio" data-study-sentence="${escapeHtml(audioText)}"${attrs}${privateCommandAttributes(command ?? { kind: 'card-action', action: 'jiten-audio', sentence: audioText })} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${speakerIcon()}</button>`;
}

function renderJitenAnnotatedReading(value: string): string {
    return renderAnnotatedReadingRuby(value);
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
    return cleanJitenAnnotatedText(word.readingFurigana || word.reading || word.matchSurface);
}

function jitenWordAudioAttributes(entry: JitenVocabularyWordSummary): string {
    return [
        `data-jiten-word-id="${escapeHtml(String(entry.wordId))}"`,
        `data-jiten-reading-index="${escapeHtml(String(entry.readingIndex))}"`,
        entry.audioUrls?.length ? `data-jiten-audio-urls="${escapeHtml(JSON.stringify(entry.audioUrls))}"` : '',
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

function jitenExampleTargetReference(target: string, card: CardHighlightTarget, info: JitenVocabularyInfo): JitenTextReference | null {
    const text = target.trim();
    if (!text) return null;
    return jitenDefinitionTextReferences(card as JPDBCard, info).find(reference => reference.text === text) ?? null;
}

function jitenExampleTargetRange(example: JitenVocabularyExample, card: CardHighlightTarget, info: JitenVocabularyInfo): { start: number; end: number } | null {
    if (example.wordPosition < 0 || example.wordLength <= 0) return null;
    const references = jitenDefinitionTextReferences(card as JPDBCard, info);
    const raw = { start: example.wordPosition, end: example.wordPosition + example.wordLength };
    const utf8 = utf8ByteRangeToUtf16Range(example.text, example.wordPosition, example.wordPosition + example.wordLength);
    return bestJitenExampleRange(example.text, references, [raw, utf8]);
}

function bestJitenExampleRange(
    text: string,
    references: JitenTextReference[],
    candidates: Array<{ start: number; end: number }>,
): { start: number; end: number } | null {
    let best: { range: { start: number; end: number }; score: number } | null = null;
    for (const range of candidates) {
        if (range.start < 0 || range.end <= range.start || range.end > text.length) continue;
        const target = text.slice(range.start, range.end);
        let score = 1;
        if (references.some(reference => reference.text === target)) score += 100;
        if (/[\u3040-\u30ff\u3400-\u9fff々〆]/u.test(target)) score += 10;
        if (!best || score > best.score) best = { range, score };
    }
    return best?.range ?? null;
}

function utf8ByteRangeToUtf16Range(text: string, start: number, end: number): { start: number; end: number } {
    return {
        start: utf16OffsetForUtf8ByteOffset(text, start),
        end: utf16OffsetForUtf8ByteOffset(text, end),
    };
}

function utf16OffsetForUtf8ByteOffset(text: string, byteOffset: number): number {
    if (byteOffset <= 0) return 0;
    let bytes = 0;
    let offset = 0;
    for (const char of text) {
        if (bytes >= byteOffset) return offset;
        const nextBytes = bytes + utf8ByteLength(char);
        if (nextBytes > byteOffset) return offset;
        bytes = nextBytes;
        offset += char.length;
    }
    return text.length;
}

function utf8ByteLength(char: string): number {
    const point = char.codePointAt(0) ?? 0;
    if (point <= 0x7f) return 1;
    if (point <= 0x7ff) return 2;
    if (point <= 0xffff) return 3;
    return 4;
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

function renderPassiveJitenReference(reference: JitenTextReference, options: RenderJitenReferenceOptions = {}): string {
    return renderPassiveReference({
        text: reference.text,
        reading: reference.reading,
        dictionary: 'Jiten',
        sentence: options.sentence,
        className: options.className,
        annotatedReading: options.annotatedReading,
        identityAttributes: {
            ...(reference.wordId !== undefined ? { 'data-vid': String(reference.wordId) } : {}),
            ...(reference.readingIndex !== undefined ? { 'data-sid': String(reference.readingIndex) } : {}),
        },
    });
}

function hasJapaneseText(value: string): boolean {
    return /[\u3040-\u30ff\u3400-\u9fff々〆]/u.test(value);
}

function definitionSourceStateKey(sourceId: string): string {
    return `definition-source:${sourceId}`;
}
