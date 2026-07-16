import type { InterfaceLanguage, JPDBCard } from '../app/types';
import { resolveUiLanguage, uiText } from '../app/i18n';
import { BUNPRO_DEFINITION_SOURCE_ID } from '../app/constants';
import { escapeHtml } from '../dom';
import { definitionSourceStateKey } from '../sources/definition-render';
import { speakerIcon } from '../ui/icons';
import type { BunproClient } from './bunpro';

export interface BunproExampleSentencePart {
    text: string;
    target: boolean;
}

export interface BunproExampleSentence {
    parts: BunproExampleSentencePart[];
    text: string;
    translation: string;
    audioUrl: string;
}

export interface BunproDefinitionInfo {
    id: number;
    kind: 'vocabulary' | 'grammar';
    expression: string;
    reading: string;
    slug: string;
    meaning: string;
    nuance: string;
    nuanceTranslation: string;
    acceptedAnswers: string[];
    partOfSpeech: string[];
    jlptLevel: string;
    sourceUrl: string;
    examples: BunproExampleSentence[];
}

export type BunproDefinitionNoMatchReason =
    | 'no-results'
    | 'selection-not-found'
    | 'expression-mismatch'
    | 'reading-mismatch'
    | 'ambiguous';

export type BunproDefinitionLookupResult =
    | { state: 'success'; info: BunproDefinitionInfo }
    | { state: 'no-match'; reason: BunproDefinitionNoMatchReason; info: null };

export type BunproDefinitionStatus =
    | { state: 'loading' }
    | { state: 'disabled'; reason: 'definitions-disabled' | 'load-excluded' }
    | { state: 'client-unavailable' }
    | { state: 'auth-missing' }
    | { state: 'auth-expired' }
    | { state: 'success' }
    | { state: 'no-match'; reason: BunproDefinitionNoMatchReason }
    | { state: 'timeout' }
    | { state: 'error' };

const BUNPRO_EXAMPLE_LIMIT = 10;

interface BunproDefinitionSelection {
    id?: number;
    kind?: BunproDefinitionInfo['kind'];
}

export async function lookupBunproDefinition(client: BunproClient, card: JPDBCard): Promise<BunproDefinitionInfo | null> {
    const result = await lookupBunproDefinitionResult(client, card);
    return result.info;
}

export async function lookupBunproDefinitionResult(client: BunproClient, card: JPDBCard): Promise<BunproDefinitionLookupResult> {
    const raw = await client.search(card.spelling, { grammar: true, vocab: true, limit: 12 });
    const result = selectBunproDefinitionSearch(raw, card.spelling, card.reading, {
        id: card.bunproReviewableId,
        kind: bunproDefinitionKind(card.bunproReviewableType),
    });
    if (!result.info) return result;
    const info = result.info;
    // Example sentences (with audio) live on the reviewable detail endpoint,
    // not in the search envelope. A failed detail fetch degrades to an
    // examples-free card rather than dropping the whole Bunpro source.
    const detail = await bunproReviewableDetail(client, info).catch(() => null);
    if (detail !== null) info.examples = normalizeBunproExampleSentences(detail);
    return { state: 'success', info };
}

function bunproReviewableDetail(client: BunproClient, info: BunproDefinitionInfo): Promise<unknown> {
    return info.kind === 'vocabulary'
        ? client.getVocab(info.slug || info.id)
        : client.getGrammarPoint(info.id);
}

export function normalizeBunproExampleSentences(raw: unknown): BunproExampleSentence[] {
    const included = objectRecord(raw)?.included;
    if (!Array.isArray(included)) return [];
    return included
        .map(bunproExampleSentence)
        .filter((item): item is BunproExampleSentence & { order: number } => item !== null)
        .sort((a, b) => a.order - b.order)
        .slice(0, BUNPRO_EXAMPLE_LIMIT)
        .map(({ order: _order, ...example }) => example);
}

function bunproExampleSentence(value: unknown): (BunproExampleSentence & { order: number }) | null {
    const record = objectRecord(value);
    if (textValue(record?.type) !== 'study_question') return null;
    const attributes = objectRecord(record?.attributes);
    if (!attributes) return null;
    const answer = textValue(attributes.kanji_answer) || textValue(attributes.answer);
    const content = fillBunproClozeContent(textValue(attributes.content), answer);
    const parts = bunproSentenceParts(content);
    const text = stripBunproFurigana(parts.map(part => part.text).join('')).trim();
    if (!text || !/[぀-ヿ㐀-鿿]/u.test(text)) return null;
    return {
        parts,
        text,
        translation: stripBunproMarkup(textValue(attributes.translation)),
        audioUrl: bunproHttpsUrl(textValue(attributes.female_audio_url)) || bunproHttpsUrl(textValue(attributes.male_audio_url)),
        order: Number(attributes.sentence_order) || 0,
    };
}

// Cloze study questions ship the blank as underscores and the filled answer
// separately; splice it back in as the highlighted target segment.
function fillBunproClozeContent(content: string, answer: string): string {
    if (!answer || !/_{2,}/u.test(content)) return content;
    return content.replace(/_{2,}/u, `<strong>${answer}</strong>`);
}

function bunproSentenceParts(content: string): BunproExampleSentencePart[] {
    const parts: BunproExampleSentencePart[] = [];
    content.split(/<strong[^>]*>([\s\S]*?)<\/strong>/gi).forEach((segment, index) => {
        const text = stripBunproMarkup(segment ?? '');
        if (!text) return;
        parts.push({ text, target: index % 2 === 1 });
    });
    return parts;
}

function stripBunproMarkup(value: string): string {
    return decodeBasicEntities(value.replace(/<[^>]*>/g, ''));
}

function decodeBasicEntities(value: string): string {
    return value
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function bunproHttpsUrl(value: string): string {
    return value.startsWith('https://') ? value : '';
}

export function normalizeBunproDefinitionSearch(
    raw: unknown,
    expression: string,
    reading = '',
    selection: BunproDefinitionSelection = {},
): BunproDefinitionInfo | null {
    return selectBunproDefinitionSearch(raw, expression, reading, selection).info;
}

function selectBunproDefinitionSearch(
    raw: unknown,
    expression: string,
    reading = '',
    selection: BunproDefinitionSelection = {},
): BunproDefinitionLookupResult {
    const candidates = bunproDefinitionCandidates(raw);
    if (!candidates.length) return noBunproMatch('no-results');

    const selectedById = selectBunproDefinitionById(candidates, selection);
    if (selectedById) return selectedById;

    const eligible = selection.kind ? candidates.filter(item => item.kind === selection.kind) : candidates;
    return selectExactBunproDefinition(eligible, expression, reading);
}

function bunproDefinitionCandidates(raw: unknown): BunproDefinitionInfo[] {
    return [
        ...searchItems(raw, 'vocabs').map(item => definitionInfo(item, 'vocabulary')),
        ...searchItems(raw, 'grammar_points').map(item => definitionInfo(item, 'grammar')),
    ].filter((item): item is BunproDefinitionInfo => item !== null);
}

function selectBunproDefinitionById(
    candidates: BunproDefinitionInfo[],
    selection: BunproDefinitionSelection,
): BunproDefinitionLookupResult | null {
    const expectedId = numberValue(selection.id);
    if (!expectedId) return null;
    const info = candidates.find(item => item.id === expectedId && (!selection.kind || item.kind === selection.kind));
    return info ? bunproMatch(info) : noBunproMatch('selection-not-found');
}

function selectExactBunproDefinition(
    candidates: BunproDefinitionInfo[],
    expression: string,
    reading: string,
): BunproDefinitionLookupResult {
    const normalizedExpression = normalizedLookupText(expression);
    const exactExpression = candidates.filter(item => normalizedLookupText(item.expression) === normalizedExpression);
    if (!exactExpression.length) return noBunproMatch('expression-mismatch');
    return reading
        ? selectExactBunproReading(exactExpression, reading)
        : selectUnambiguousBunproDefinition(exactExpression, 'ambiguous');
}

function selectExactBunproReading(candidates: BunproDefinitionInfo[], reading: string): BunproDefinitionLookupResult {
    const normalizedReading = normalizedLookupText(reading);
    const exactReading = candidates.filter(item => normalizedLookupText(item.reading) === normalizedReading);
    return exactReading.length
        ? selectUnambiguousBunproDefinition(exactReading, 'ambiguous')
        : noBunproMatch('reading-mismatch');
}

function selectUnambiguousBunproDefinition(
    candidates: BunproDefinitionInfo[],
    ambiguousReason: BunproDefinitionNoMatchReason,
): BunproDefinitionLookupResult {
    if (candidates.length === 1 || sameDefinitionIdentity(candidates)) return bunproMatch(candidates[0]!);
    // A spelling can be both vocabulary and grammar. Without a known Bunpro
    // id/type, showing neither is safer than silently displaying the wrong one.
    return noBunproMatch(ambiguousReason);
}

function bunproMatch(info: BunproDefinitionInfo): BunproDefinitionLookupResult {
    return { state: 'success', info };
}

function noBunproMatch(reason: BunproDefinitionNoMatchReason): BunproDefinitionLookupResult {
    return { state: 'no-match', reason, info: null };
}

export function renderBunproDefinitionSource(
    card: JPDBCard,
    sourceAttributes: (key: string, initiallyExpanded?: boolean) => string,
    info: BunproDefinitionInfo | null,
    language: InterfaceLanguage,
    title = 'Bunpro',
): string {
    if (!info) return '';
    const details = [
        info.jlptLevel ? `<span class="jpdb-reader-dict-tag">${escapeHtml(info.jlptLevel.toUpperCase())}</span>` : '',
        ...info.partOfSpeech.slice(0, 4).map(value => `<span class="jpdb-reader-dict-tag">${escapeHtml(value)}</span>`),
    ].filter(Boolean).join('');
    const accepted = info.acceptedAnswers.filter(answer => answer !== info.expression && answer !== info.reading).slice(0, 8);
    const japanese = resolveUiLanguage(language) === 'ja';
    const acceptedLabel = japanese ? '正解として認められる答え' : 'Accepted answers';
    const nuanceLabel = japanese ? 'ニュアンス' : 'Nuance';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-bunpro-definition" data-source="bunpro" ${sourceAttributes(definitionSourceStateKey(BUNPRO_DEFINITION_SOURCE_ID))}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <article class="jpdb-reader-local-entry jpdb-reader-local-term">
                ${repeatsLookupHeadword(card, info) ? '' : `<div class="jpdb-reader-local-head"><span class="jpdb-reader-local-expression">${escapeHtml(info.expression)}</span>${info.reading && info.reading !== info.expression ? `<span class="jpdb-reader-local-reading">${escapeHtml(info.reading)}</span>` : ''}</div>`}
                ${details ? `<div class="jpdb-reader-local-tags">${details}</div>` : ''}
                ${info.meaning ? `<div class="jpdb-reader-local-senses"><div class="jpdb-reader-local-sense"><span>${escapeHtml(info.meaning)}</span></div></div>` : ''}
                ${info.nuance ? `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(nuanceLabel)}</strong><div>${escapeHtml(info.nuance)}</div>${info.nuanceTranslation ? `<div>${escapeHtml(info.nuanceTranslation)}</div>` : ''}</div>` : ''}
                ${accepted.length ? `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(acceptedLabel)}</strong><div>${accepted.map(escapeHtml).join(' · ')}</div></div>` : ''}
                ${renderBunproExamples(info.examples, sourceAttributes, language)}
                <a class="jpdb-reader-pill jpdb-reader-action-pill" href="${escapeHtml(info.sourceUrl)}" target="_blank" rel="noopener">Bunpro ↗</a>
            </article>
        </details>
    `;
}

function renderBunproExamples(examples: BunproExampleSentence[], sourceAttributes: (key: string, initiallyExpanded?: boolean) => string, language: InterfaceLanguage): string {
    return examples.length ? `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-examples-group jpdb-reader-bunpro-examples-group" ${sourceAttributes(definitionSourceStateKey(`${BUNPRO_DEFINITION_SOURCE_ID}:examples`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'exampleSentences'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${examples.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-examples">
                    ${examples.map(example => renderBunproExample(example, language)).join('')}
                </ul>
            </div>
        </details>
    ` : '';
}

function renderBunproExample(example: BunproExampleSentence, language: InterfaceLanguage): string {
    return `
        <li class="jpdb-reader-jpdb-example jpdb-reader-bunpro-example">
            <div class="jpdb-reader-jpdb-example-row has-audio">
                ${renderBunproAudioButton(example, language)}
                <div class="jpdb-reader-jpdb-example-text">
                    <div class="jpdb-reader-example-sentence jpdb-reader-parseable">${example.parts.map(renderBunproExamplePart).join('')}</div>
                    ${example.translation ? `<div class="jpdb-reader-example-translation">${escapeHtml(example.translation)}</div>` : ''}
                </div>
            </div>
        </li>
    `;
}

function renderBunproExamplePart(part: BunproExampleSentencePart): string {
    const html = renderBunproAnnotatedText(part.text);
    return part.target ? `<mark class="jpdb-reader-example-target jpdb-reader-bunpro-example-target">${html}</mark>` : html;
}

function renderBunproAudioButton(example: BunproExampleSentence, language: InterfaceLanguage): string {
    const label = uiText(language, 'playAudio');
    const audioUrl = example.audioUrl ? ` data-audio-url="${escapeHtml(example.audioUrl)}"` : '';
    return `<button class="jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio jpdb-reader-bunpro-audio" type="button" data-action="bunpro-audio" data-study-sentence="${escapeHtml(example.text)}"${audioUrl} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${speakerIcon()}</button>`;
}

// Bunpro annotates readings inline as 漢字（かんじ） (full-width parens right
// after the kanji run); render them as ruby so the sentence reads like the
// rest of the popover.
const BUNPRO_FURIGANA_RE = /([一-龯々-〇]+)（([ぁ-ゖァ-ヺー・]+)）/g;

function renderBunproAnnotatedText(value: string): string {
    let html = '';
    let offset = 0;
    let match: RegExpExecArray | null;
    BUNPRO_FURIGANA_RE.lastIndex = 0;
    while ((match = BUNPRO_FURIGANA_RE.exec(value)) !== null) {
        html += escapeHtml(value.slice(offset, match.index));
        html += `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(match[1] ?? '')}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(match[2] ?? '')}</rt><rp>)</rp></ruby>`;
        offset = match.index + match[0].length;
    }
    html += escapeHtml(value.slice(offset));
    return html;
}

function stripBunproFurigana(value: string): string {
    BUNPRO_FURIGANA_RE.lastIndex = 0;
    return value.replace(BUNPRO_FURIGANA_RE, '$1');
}

function definitionInfo(value: unknown, kind: BunproDefinitionInfo['kind']): BunproDefinitionInfo | null {
    const record = objectRecord(value);
    const attributes = objectRecord(record?.attributes) ?? record;
    if (!attributes) return null;
    const id = numberValue(attributes.id ?? record?.id);
    const expression = textValue(attributes.title ?? attributes.grammar_point ?? attributes.word);
    if (!id || !expression) return null;
    const reading = textValue(attributes.kana ?? attributes.furigana ?? attributes.reading) || expression;
    const slug = textValue(attributes.slug) || expression;
    return {
        id,
        kind,
        expression,
        reading,
        slug,
        meaning: textValue(attributes.meaning),
        nuance: textValue(attributes.nuance),
        nuanceTranslation: textValue(attributes.nuance_translation),
        acceptedAnswers: textList(attributes.accepted_answers),
        partOfSpeech: textList(attributes.jmdict_pos),
        jlptLevel: textValue(attributes.jlpt_level),
        sourceUrl: kind === 'vocabulary'
            ? `https://bunpro.jp/vocabs/${encodeURIComponent(slug)}`
            : `https://bunpro.jp/grammar_points/${encodeURIComponent(slug)}`,
        examples: [],
    };
}

function searchItems(raw: unknown, key: 'vocabs' | 'grammar_points'): unknown[] {
    const section = objectRecord(objectRecord(raw)?.[key]);
    return Array.isArray(section?.data) ? section.data : [];
}

function repeatsLookupHeadword(card: JPDBCard, info: BunproDefinitionInfo): boolean {
    return info.expression === card.spelling && (!card.reading || info.reading === card.reading || info.reading === info.expression);
}

function bunproDefinitionKind(type: JPDBCard['bunproReviewableType']): BunproDefinitionInfo['kind'] | undefined {
    if (type === 'vocabulary' || type === 'grammar') return type;
    return undefined;
}

function normalizedLookupText(value: string): string {
    return value.normalize('NFKC').trim();
}

function sameDefinitionIdentity(items: BunproDefinitionInfo[]): boolean {
    const first = items[0];
    return Boolean(first && items.every(item => item.id === first.id && item.kind === first.kind));
}

function textList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
    const text = textValue(value);
    return text ? text.split(/[;,]\s*/u).map(item => item.trim()).filter(Boolean) : [];
}

function textValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function numberValue(value: unknown): number {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 0;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
