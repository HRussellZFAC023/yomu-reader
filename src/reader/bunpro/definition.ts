import type { InterfaceLanguage, JPDBCard } from '../app/types';
import { resolveUiLanguage } from '../app/i18n';
import { BUNPRO_DEFINITION_SOURCE_ID } from '../app/constants';
import { escapeHtml } from '../dom';
import { definitionSourceStateKey } from '../sources/definition-render';
import type { BunproClient } from './bunpro';

export interface BunproDefinitionInfo {
    id: number;
    kind: 'vocabulary' | 'grammar';
    expression: string;
    reading: string;
    meaning: string;
    nuance: string;
    nuanceTranslation: string;
    acceptedAnswers: string[];
    partOfSpeech: string[];
    jlptLevel: string;
    sourceUrl: string;
}

interface BunproDefinitionSelection {
    id?: number;
    kind?: BunproDefinitionInfo['kind'];
}

export async function lookupBunproDefinition(client: BunproClient, card: JPDBCard): Promise<BunproDefinitionInfo | null> {
    const raw = await client.search(card.spelling, { grammar: true, vocab: true, limit: 12 });
    return normalizeBunproDefinitionSearch(raw, card.spelling, card.reading, {
        id: card.bunproReviewableId,
        kind: bunproDefinitionKind(card.bunproReviewableType),
    });
}

export function normalizeBunproDefinitionSearch(
    raw: unknown,
    expression: string,
    reading = '',
    selection: BunproDefinitionSelection = {},
): BunproDefinitionInfo | null {
    const candidates = [
        ...searchItems(raw, 'vocabs').map(item => definitionInfo(item, 'vocabulary')),
        ...searchItems(raw, 'grammar_points').map(item => definitionInfo(item, 'grammar')),
    ].filter((item): item is BunproDefinitionInfo => item !== null);
    if (!candidates.length) return null;

    const expectedKind = selection.kind;
    const expectedId = numberValue(selection.id);
    if (expectedId) {
        return candidates.find(item => item.id === expectedId && (!expectedKind || item.kind === expectedKind)) ?? null;
    }

    const eligible = expectedKind ? candidates.filter(item => item.kind === expectedKind) : candidates;
    const normalizedExpression = normalizedLookupText(expression);
    const exactExpression = eligible.filter(item => normalizedLookupText(item.expression) === normalizedExpression);
    if (!exactExpression.length) return null;
    if (reading) {
        const normalizedReading = normalizedLookupText(reading);
        const exactReading = exactExpression.filter(item => normalizedLookupText(item.reading) === normalizedReading);
        if (exactReading.length === 1) return exactReading[0] ?? null;
        if (exactReading.length > 1 && sameDefinitionIdentity(exactReading)) return exactReading[0] ?? null;
        return null;
    }
    if (exactExpression.length === 1 || sameDefinitionIdentity(exactExpression)) return exactExpression[0] ?? null;
    // A spelling can be both vocabulary and grammar. Without a known Bunpro
    // id/type, showing neither is safer than silently displaying the wrong one.
    return null;
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
                <a class="jpdb-reader-pill jpdb-reader-action-pill" href="${escapeHtml(info.sourceUrl)}" target="_blank" rel="noopener">Bunpro ↗</a>
            </article>
        </details>
    `;
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
        meaning: textValue(attributes.meaning),
        nuance: textValue(attributes.nuance),
        nuanceTranslation: textValue(attributes.nuance_translation),
        acceptedAnswers: textList(attributes.accepted_answers),
        partOfSpeech: textList(attributes.jmdict_pos),
        jlptLevel: textValue(attributes.jlpt_level),
        sourceUrl: kind === 'vocabulary'
            ? `https://bunpro.jp/vocabs/${encodeURIComponent(slug)}`
            : `https://bunpro.jp/grammar_points/${encodeURIComponent(slug)}`,
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
