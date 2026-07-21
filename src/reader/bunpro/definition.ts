import type { InterfaceLanguage, JPDBCard } from '../app/types';
import { resolveUiLanguage, uiText } from '../app/i18n';
import { BUNPRO_DEFINITION_SOURCE_ID } from '../app/constants';
import { escapeHtml } from '../dom';
import { formatPartOfSpeech } from '../lookup/pos';
import { definitionSourceStateKey } from '../sources/definition-render';
import { renderProviderExamples, type ProviderCollection, type ProviderExampleView } from '../sources/provider-examples';
import { renderPassiveReference } from '../sources/passive-reference';
import { BunproApiError, type BunproClient } from './bunpro';
import { LruCache } from '../core/lru-cache';
import { httpStatusFromError } from '../network/error-status';

export interface BunproExampleSentencePart {
    text: string;
    target: boolean;
}

export interface BunproExampleSentence {
    id: string;
    parts: BunproExampleSentencePart[];
    text: string;
    translation: string;
    audioUrls: string[];
    source: { provider: 'bunpro'; url: string };
}

export interface BunproRelatedWord {
    text: string;
    relation: 'related' | 'antonym';
}

export interface BunproRelatedGrammar {
    id: number;
    title: string;
    slug: string;
}

export interface BunproUsedInVocab {
    id: number;
    text: string;
    reading: string;
    meaning: string;
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
    examplesAvailability: 'loaded' | 'empty' | 'unavailable';
    examplesUnavailableReason: '' | 'auth' | 'network' | 'schema';
    // Reviewable-detail enrichment (empty until the detail payload loads).
    pitchAccentStress: string;
    frequencies: Array<{ list: string; rank: number }>;
    relatedWords: BunproRelatedWord[];
    caution: string;
    register: string;
    registerTranslation: string;
    structures: Array<{ label: 'polite' | 'casual'; lines: string[] }>;
    relatedGrammar: BunproRelatedGrammar[];
    coverageVocabIds: number[];
    usedInVocab: BunproUsedInVocab[];
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
    // Detail failure must not erase the definition, but it also must not be
    // misrepresented as an authoritative zero-example result.
    try {
        const detail = await bunproReviewableDetail(client, info);
        applyBunproReviewableDetail(info, detail);
        applyBunproExampleCollection(info, normalizeBunproExampleCollection(detail, info.sourceUrl));
    } catch (error) {
        applyBunproExampleCollection(info, { availability: 'unavailable', items: [], reason: bunproExampleFailureReason(error) });
    }
    await resolveBunproUsedInVocab(client, info);
    return { state: 'success', info };
}

const BUNPRO_FREQUENCY_LISTS = ['general', 'anime', 'novels', 'netflix', 'dictionary'] as const;

// The reviewable-detail payload carries pitch, multi-list frequency, word
// audio, JMdict relations and grammar metadata alongside the study questions;
// read them off the same response instead of dropping them.
function applyBunproReviewableDetail(info: BunproDefinitionInfo, raw: unknown): void {
    const attributes = objectRecord(objectRecord(objectRecord(raw)?.data)?.attributes);
    if (!attributes) return;
    info.pitchAccentStress = textValue(attributes.pitch_accent_stress);
    info.frequencies = BUNPRO_FREQUENCY_LISTS
        .map(list => ({ list, rank: numberValue(attributes[`frequency_${list}`]) }))
        .filter(entry => entry.rank > 0);
    info.relatedWords = bunproJmdictRelatedWords(attributes.jmdict_data, info);
    info.caution = stripBunproMarkup(textValue(attributes.caution));
    info.register = textValue(attributes.register);
    info.registerTranslation = textValue(attributes.register_translation);
    info.structures = ([['polite', attributes.polite_structure], ['casual', attributes.casual_structure]] as const)
        .map(([label, value]) => ({ label, lines: bunproStructureLines(textValue(value)) }))
        .filter(entry => entry.lines.length);
    info.relatedGrammar = uniqueRelatedGrammar([
        bunproRelatedGrammarPoint(attributes.previous_grammar_point),
        bunproRelatedGrammarPoint(attributes.next_grammar_point),
    ]).filter(entry => entry.id !== info.id);
    info.coverageVocabIds = bunproCoverageVocabIds(attributes.coverage_vocab_ids);
}

function bunproCoverageVocabIds(raw: unknown): number[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(value => numberValue(value))
        .filter(id => id > 0)
        .slice(0, 50);
}

const BUNPRO_USED_IN_LIMIT = 5;
const BUNPRO_USED_IN_TIMEOUT_MS = 4000;
const bunproUsedInVocabCache = new LruCache<number, BunproUsedInVocab>(200);

// Grammar coverage vocab arrives as bare ids and each id needs its own
// vocab-detail request, so resolution is strictly bounded: only the first few
// ids, an LRU cache so reopening a grammar entry costs nothing, individual
// failures dropped, and a soft time cap so a slow Bunpro never delays the
// definition itself (late responses still land in the cache for next time).
async function resolveBunproUsedInVocab(client: BunproClient, info: BunproDefinitionInfo): Promise<void> {
    if (info.kind !== 'grammar') return;
    const ids = info.coverageVocabIds.slice(0, BUNPRO_USED_IN_LIMIT);
    if (!ids.length) return;
    const resolved = await Promise.race([
        Promise.all(ids.map(id => bunproUsedInVocabEntry(client, id))),
        new Promise<null>(resolve => setTimeout(() => resolve(null), BUNPRO_USED_IN_TIMEOUT_MS)),
    ]);
    if (!resolved) return;
    info.usedInVocab = resolved.filter((entry): entry is BunproUsedInVocab => entry !== null);
}

async function bunproUsedInVocabEntry(client: BunproClient, id: number): Promise<BunproUsedInVocab | null> {
    const cached = bunproUsedInVocabCache.get(id);
    if (cached) return cached;
    try {
        const attributes = objectRecord(objectRecord(objectRecord(await client.getVocab(id))?.data)?.attributes);
        const kana = textValue(attributes?.kana);
        const text = textValue(attributes?.word) || kana;
        if (!text) return null;
        const entry: BunproUsedInVocab = {
            id,
            text,
            reading: kana && kana !== text ? kana : '',
            meaning: stripBunproMarkup(textValue(attributes?.meaning)),
        };
        bunproUsedInVocabCache.set(id, entry);
        return entry;
    } catch {
        return null;
    }
}

function bunproJmdictRelatedWords(raw: unknown, info: BunproDefinitionInfo): BunproRelatedWord[] {
    const senses = objectRecord(raw)?.sense;
    if (!Array.isArray(senses)) return [];
    const seen = new Set<string>([info.expression, info.reading]);
    const related: BunproRelatedWord[] = [];
    for (const sense of senses) {
        const record = objectRecord(sense);
        for (const relation of ['related', 'antonym'] as const) {
            for (const reference of Array.isArray(record?.[relation]) ? record[relation] as unknown[] : []) {
                const text = textValue(Array.isArray(reference) ? reference[0] : reference);
                if (!text || seen.has(text)) continue;
                seen.add(text);
                related.push({ text, relation });
            }
        }
    }
    return related.slice(0, 20);
}

function bunproStructureLines(value: string): string[] {
    return value
        .split(/<br\s*\/?\s*>|\n/gi)
        .map(line => stripBunproFurigana(stripBunproMarkup(line)).trim())
        .filter(Boolean)
        .slice(0, 12);
}

function bunproRelatedGrammarPoint(raw: unknown): BunproRelatedGrammar | null {
    const record = objectRecord(raw);
    const id = numberValue(record?.id);
    const title = textValue(record?.title);
    if (!id || !title) return null;
    return { id, title, slug: textValue(record?.slug) || title };
}

function uniqueRelatedGrammar(entries: Array<BunproRelatedGrammar | null>): BunproRelatedGrammar[] {
    const seen = new Set<number>();
    return entries.filter((entry): entry is BunproRelatedGrammar => {
        if (!entry || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
    });
}

function bunproReviewableDetail(client: BunproClient, info: BunproDefinitionInfo): Promise<unknown> {
    return info.kind === 'vocabulary'
        ? client.getVocab(info.slug || info.id)
        : client.getGrammarPoint(info.id);
}

export function normalizeBunproExampleSentences(raw: unknown): BunproExampleSentence[] {
    const collection = normalizeBunproExampleCollection(raw, 'https://bunpro.jp/');
    return collection.availability === 'loaded' ? collection.items : [];
}

function normalizeBunproExampleCollection(raw: unknown, sourceUrl: string): ProviderCollection<BunproExampleSentence> {
    const included = objectRecord(raw)?.included;
    if (!Array.isArray(included)) return { availability: 'unavailable', items: [], reason: 'schema' };
    const questions = included.filter(value => textValue(objectRecord(value)?.type) === 'study_question');
    if (!questions.length) return { availability: 'empty', items: [] };
    const examples = questions
        .map(value => bunproExampleSentence(value, sourceUrl))
        .filter((item): item is BunproExampleSentence & { order: number } => item !== null)
        .sort((a, b) => a.order - b.order);
    if (!examples.length) return { availability: 'unavailable', items: [], reason: 'schema' };
    const deduped = dedupeBunproExamples(examples)
        .slice(0, BUNPRO_EXAMPLE_LIMIT)
        .map(({ order: _order, ...example }) => example);
    return { availability: 'loaded', items: deduped };
}

function applyBunproExampleCollection(info: BunproDefinitionInfo, collection: ProviderCollection<BunproExampleSentence>): void {
    info.examples = collection.items;
    info.examplesAvailability = collection.availability;
    info.examplesUnavailableReason = collection.availability === 'unavailable' ? collection.reason : '';
}

function bunproExampleSentence(value: unknown, sourceUrl: string): (BunproExampleSentence & { order: number }) | null {
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
        id: textValue(record?.id) || textValue(attributes.id) || `example-${Number(attributes.sentence_order) || 0}`,
        parts,
        text,
        translation: stripBunproMarkup(textValue(attributes.translation)),
        audioUrls: uniqueText([
            bunproHttpsUrl(textValue(attributes.female_audio_url)),
            bunproHttpsUrl(textValue(attributes.male_audio_url)),
        ]),
        source: { provider: 'bunpro', url: sourceUrl },
        order: Number(attributes.sentence_order) || 0,
    };
}

function dedupeBunproExamples(examples: Array<BunproExampleSentence & { order: number }>): Array<BunproExampleSentence & { order: number }> {
    const unique = new Map<string, BunproExampleSentence & { order: number }>();
    for (const example of examples) {
        const key = `${normalizedDisplayText(example.text)}\u0000${normalizedDisplayText(example.translation)}`;
        const current = unique.get(key);
        if (!current) {
            unique.set(key, example);
            continue;
        }
        current.audioUrls = uniqueText([...current.audioUrls, ...example.audioUrls]);
    }
    return Array.from(unique.values());
}

function bunproExampleFailureReason(error: unknown): 'auth' | 'network' | 'schema' {
    const status = error instanceof BunproApiError ? error.status : httpStatusFromError(error);
    if (status === 401 || status === 403) return 'auth';
    if (status === 404) return 'schema';
    return 'network';
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
    const japanese = resolveUiLanguage(language) === 'ja';
    const registerTag = japanese ? info.register : info.registerTranslation || info.register;
    const details = [
        info.jlptLevel ? `<span class="jpdb-reader-dict-tag">${escapeHtml(info.jlptLevel)}</span>` : '',
        ...info.partOfSpeech.slice(0, 4).map(value => `<span class="jpdb-reader-dict-tag">${escapeHtml(value)}</span>`),
        registerTag ? `<span class="jpdb-reader-dict-tag">${escapeHtml(registerTag)}</span>` : '',
    ].filter(Boolean).join('');
    const accepted = info.kind === 'grammar'
        ? distinctDisplayText(info.acceptedAnswers, [info.expression, info.reading]).slice(0, 8)
        : [];
    const nuanceLabel = japanese ? 'ニュアンス' : 'Nuance';
    const glosses = distinctBunproGlosses(info);
    const extras = `${renderBunproExamples(info, sourceAttributes, language)}${renderBunproUsedInVocab(info, sourceAttributes, language)}${renderBunproRelatedWords(info, sourceAttributes, language)}${renderBunproRelatedGrammar(info, sourceAttributes, language)}`;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-bunpro-definition" data-source="bunpro" ${sourceAttributes(definitionSourceStateKey(BUNPRO_DEFINITION_SOURCE_ID))}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <article class="jpdb-reader-local-entry jpdb-reader-local-term">
                ${renderBunproHeadword(card, info, language)}
                ${details ? `<div class="jpdb-reader-local-tags">${details}</div>` : ''}
                ${glosses.meaning ? `<div class="jpdb-reader-local-senses"><div class="jpdb-reader-local-sense"><span>${escapeHtml(glosses.meaning)}</span></div></div>` : ''}
                ${glosses.nuance.length ? `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(nuanceLabel)}</strong>${glosses.nuance.map(renderBunproGlossText).join('')}</div>` : ''}
                ${accepted.length ? `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(uiText(language, 'acceptedInputs'))}</strong><div>${accepted.map(escapeHtml).join(' · ')}</div></div>` : ''}
                ${renderBunproStructures(info, language)}
                ${info.caution ? `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(uiText(language, 'bunproCaution'))}</strong><div>${escapeHtml(info.caution)}</div></div>` : ''}
            </article>
            <div class="jpdb-reader-jpdb-extras jpdb-reader-bunpro-extras">${extras}</div>
        </details>
    `;
}

// Headword mirrors the Jiten headword: a passive, parseable reader-word (so
// our annotation/lookup machinery applies). Word audio is not a per-section
// button; Bunpro pronunciation is a regular Settings → Audio source feeding
// the card's shared audio control.
function renderBunproHeadword(card: JPDBCard, info: BunproDefinitionInfo, _language: InterfaceLanguage): string {
    if (repeatsLookupHeadword(card, info)) return '';
    const reference = renderPassiveReference({
        text: info.expression,
        reading: info.reading,
        dictionary: 'Bunpro',
        className: 'jpdb-reader-bunpro-headword-target',
    });
    return `<div class="jpdb-reader-local-head jpdb-reader-bunpro-headword">${reference}</div>`;
}

// Japanese gloss text (the nuance) carries inline 漢字（かな） annotations;
// strip them and let the reader's nested re-parse annotate furigana/pitch with
// our own system, exactly like example sentences.
function renderBunproGlossText(value: string): string {
    if (!/[぀-ヿ㐀-鿿]/u.test(value)) return `<div>${escapeHtml(value)}</div>`;
    return `<div class="jpdb-reader-parseable">${escapeHtml(stripBunproFurigana(value))}</div>`;
}

function renderBunproStructures(info: BunproDefinitionInfo, language: InterfaceLanguage): string {
    if (!info.structures.length) return '';
    const blocks = info.structures.map(structure => `
        <div class="jpdb-reader-bunpro-structure" data-structure="${structure.label}">
            ${structure.lines.map(line => `<div class="jpdb-reader-parseable">${escapeHtml(line)}</div>`).join('')}
        </div>
    `).join('');
    return `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(uiText(language, 'bunproStructure'))}</strong>${blocks}</div>`;
}

function renderBunproUsedInVocab(info: BunproDefinitionInfo, sourceAttributes: (key: string, initiallyExpanded?: boolean) => string, language: InterfaceLanguage): string {
    if (!info.usedInVocab.length) return '';
    const rows = info.usedInVocab.map(entry => `
        <li class="jpdb-reader-jpdb-used-in-row">
            <span class="jpdb-reader-jpdb-used-in-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(entry.text)}" data-dictionary="Bunpro" data-external="false">
                    <span class="jpdb-reader-jpdb-compound-head">${escapeHtml(entry.text)}</span>
                </a>
                ${entry.reading ? `<small lang="ja">${escapeHtml(entry.reading)}</small>` : ''}
                ${entry.meaning ? `<small>${escapeHtml(entry.meaning)}</small>` : ''}
            </span>
        </li>
    `).join('');
    return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-used-in-group" ${sourceAttributes(definitionSourceStateKey(`${BUNPRO_DEFINITION_SOURCE_ID}:used-in`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'bunproUsedInVocab'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${info.usedInVocab.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-used-in">${rows}</ul>
            </div>
        </details>
    `;
}

function renderBunproRelatedWords(info: BunproDefinitionInfo, sourceAttributes: (key: string, initiallyExpanded?: boolean) => string, language: InterfaceLanguage): string {
    if (!info.relatedWords.length) return '';
    const rows = info.relatedWords.map(entry => `
        <li class="jpdb-reader-jpdb-used-in-row">
            <span class="jpdb-reader-jpdb-used-in-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(entry.text)}" data-dictionary="Bunpro" data-external="false">
                    <span class="jpdb-reader-jpdb-compound-head">${escapeHtml(entry.text)}</span>
                </a>
                ${entry.relation === 'antonym' ? `<small>${escapeHtml(uiText(language, 'antonymWord'))}</small>` : ''}
            </span>
        </li>
    `).join('');
    return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-used-in-group" ${sourceAttributes(definitionSourceStateKey(`${BUNPRO_DEFINITION_SOURCE_ID}:related-words`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'relatedWords'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${info.relatedWords.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-used-in">${rows}</ul>
            </div>
        </details>
    `;
}

function renderBunproRelatedGrammar(info: BunproDefinitionInfo, sourceAttributes: (key: string, initiallyExpanded?: boolean) => string, language: InterfaceLanguage): string {
    if (!info.relatedGrammar.length) return '';
    const rows = info.relatedGrammar.map(entry => `
        <li class="jpdb-reader-jpdb-used-in-row">
            <span class="jpdb-reader-jpdb-used-in-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(entry.title)}" data-dictionary="Bunpro" data-external="false">
                    <span class="jpdb-reader-jpdb-compound-head">${escapeHtml(entry.title)}</span>
                </a>
            </span>
        </li>
    `).join('');
    return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-used-in-group" ${sourceAttributes(definitionSourceStateKey(`${BUNPRO_DEFINITION_SOURCE_ID}:related-grammar`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'relatedGrammar'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${info.relatedGrammar.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-used-in">${rows}</ul>
            </div>
        </details>
    `;
}

function renderBunproExamples(info: BunproDefinitionInfo, sourceAttributes: (key: string, initiallyExpanded?: boolean) => string, language: InterfaceLanguage): string {
    const collection: ProviderCollection<BunproExampleSentence> = info.examplesAvailability === 'loaded'
        ? { availability: 'loaded', items: info.examples }
        : info.examplesAvailability === 'unavailable'
            ? { availability: 'unavailable', items: [], reason: info.examplesUnavailableReason || 'schema' }
            : { availability: 'empty', items: [] };
    const view: ProviderCollection<ProviderExampleView> = collection.availability === 'loaded'
        ? { availability: 'loaded', items: collection.items.map(example => bunproExampleView(example, language)) }
        : collection;
    return renderProviderExamples('bunpro', BUNPRO_DEFINITION_SOURCE_ID, view, sourceAttributes, language);
}

// Non-target text stays PLAIN (furigana annotations stripped) so the shared
// `.jpdb-reader-parseable` nested re-parse annotates furigana/pitch with our
// own system, exactly like the Jiten/JPDB example sentences. Only the target
// word is pre-rendered, as a passive reader-word that survives re-parse via
// the example-target mark preservation.
function renderBunproExamplePart(part: BunproExampleSentencePart, sentence: string): string {
    const plain = stripBunproFurigana(part.text);
    if (!part.target) return escapeHtml(plain);
    return renderPassiveReference({
        text: plain,
        reading: bunproAnnotatedKana(part.text),
        dictionary: 'Bunpro',
        sentence,
        className: 'jpdb-reader-example-target jpdb-reader-bunpro-example-target',
        annotatedReading: bunproBracketAnnotated(part.text),
    });
}

function bunproExampleView(example: BunproExampleSentence, language: InterfaceLanguage): ProviderExampleView {
    const audioUrl = example.audioUrls[0] ?? '';
    return {
        id: example.id,
        sentenceHtml: example.parts.map(part => renderBunproExamplePart(part, example.text)).join(''),
        translation: example.translation,
        audio: {
            action: 'bunpro-audio',
            label: uiText(language, 'playAudio'),
            attributes: {
                'data-study-sentence': example.text,
                ...(audioUrl ? { 'data-audio-url': audioUrl } : {}),
            },
        },
    };
}

// Bunpro annotates readings inline as 漢字（かんじ） (full-width parens right
// after the kanji run). Display never bakes this ad-hoc form; it is stripped
// to plain text (our parser re-annotates) or converted to the shared bracket
// form for passive-reference ruby.
const BUNPRO_FURIGANA_RE = /([一-龯々-〇]+)（([ぁ-ゖァ-ヺー・]+)）/g;

function stripBunproFurigana(value: string): string {
    BUNPRO_FURIGANA_RE.lastIndex = 0;
    return value.replace(BUNPRO_FURIGANA_RE, '$1');
}

// 読（よ）む → 読[よ]む — the bracket-annotated form shared with Jiten.
function bunproBracketAnnotated(value: string): string {
    BUNPRO_FURIGANA_RE.lastIndex = 0;
    return value.replace(BUNPRO_FURIGANA_RE, '$1[$2]');
}

// 読（よ）む → よむ; empty when the text carries no annotation (kana-only
// targets need no reading of their own).
function bunproAnnotatedKana(value: string): string {
    BUNPRO_FURIGANA_RE.lastIndex = 0;
    const rendered = value.replace(BUNPRO_FURIGANA_RE, '$2').trim();
    return rendered === value.trim() ? '' : rendered;
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
        nuance: stripBunproMarkup(textValue(attributes.nuance)),
        nuanceTranslation: stripBunproMarkup(textValue(attributes.nuance_translation)),
        acceptedAnswers: textList(attributes.accepted_answers),
        partOfSpeech: normalizeBunproPartOfSpeech(attributes.jmdict_pos),
        jlptLevel: normalizeBunproJlptLevel(attributes.jlpt_level),
        sourceUrl: kind === 'vocabulary'
            ? `https://bunpro.jp/vocabs/${encodeURIComponent(slug)}`
            : `https://bunpro.jp/grammar_points/${encodeURIComponent(slug)}`,
        examples: [],
        examplesAvailability: 'empty',
        examplesUnavailableReason: '',
        pitchAccentStress: '',
        frequencies: [],
        relatedWords: [],
        caution: '',
        register: '',
        registerTranslation: '',
        structures: [],
        relatedGrammar: [],
        coverageVocabIds: [],
        usedInVocab: [],
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

function normalizeBunproJlptLevel(value: unknown): string {
    const level = textValue(value).normalize('NFKC').toUpperCase();
    return /^N[1-5]$/u.test(level) ? level : '';
}

function normalizeBunproPartOfSpeech(value: unknown): string[] {
    return uniqueText(textList(value)
        .filter(tag => !/^(?:unc|unclassified)$/iu.test(tag))
        .map(tag => formatPartOfSpeech([tag]).trim())
        .filter(label => label && !/^unclassified$/iu.test(label)));
}

function distinctBunproGlosses(info: BunproDefinitionInfo): { meaning: string; nuance: string[] } {
    const meaning = info.meaning.trim();
    return {
        meaning,
        nuance: distinctDisplayText([info.nuance, info.nuanceTranslation], meaning ? [meaning] : []),
    };
}

function distinctDisplayText(values: string[], excluded: string[] = []): string[] {
    const seen = new Set(excluded.map(normalizedDisplayText).filter(Boolean));
    const result: string[] = [];
    for (const value of values) {
        const text = value.trim();
        const key = normalizedDisplayText(text);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}

function normalizedDisplayText(value: string): string {
    return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

function uniqueText(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
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
