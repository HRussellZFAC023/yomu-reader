import { escapeHtml } from '../dom/index';
import {
    collectPitchVariants,
    pitchClassNameForPattern,
    pitchLevelsForDisplay,
    splitMorae,
    type PitchVariant,
} from '../lookup/pitch-accent';
import { localPitchPatternsFromMeta } from '../lookup/pitch-meta';
import type { JPDBCard } from '../app/types';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';

// A reading can carry more than one legitimate accent (双子 0/3, 一分 いちぶ
// 2/3 …) and which one is correct depends on the sentence. Showing only the
// first candidate silently presents a possibly-wrong accent as THE accent, so
// render every distinct pattern the sources list (JPDB first, then the local
// pitch bank), capped to keep the header compact.
const MAX_PITCH_VARIANTS = 3;

export function renderPitch(card: JPDBCard, metaEntries: YomitanMetaEntry[] = []): string {
    const reading = cardPronunciationReading(card);
    if (!reading) return '';
    const variants = collectPitchVariants(reading, [
        ...(card.pitchAccent ?? []),
        ...localPitchPatternsFromMeta(reading, metaEntries),
    ], MAX_PITCH_VARIANTS);
    return renderPitchVariantGraphs(reading, variants);
}

export function renderPitchVariantGraphs(reading: string, variants: PitchVariant[]): string {
    const graphs = variants
        .map(variant => ({
            variant,
            svg: renderPitchGraphSvg(reading, variant.pattern, { centerContent: true }),
        }))
        .filter(entry => entry.svg);
    if (!graphs.length) return '';
    if (graphs.length === 1) return `<div class="jpdb-reader-pitch">${graphs[0].svg}</div>`;
    const percentages = pitchVariantDisplayPercentages(graphs.map(entry => entry.variant));
    return `<div class="jpdb-reader-pitch jpdb-reader-pitch-variants">${graphs
        .map((entry, index) => `<span class="jpdb-reader-pitch-component jpdb-reader-pitch-variant${index === 0 ? ' jpdb-reader-pitch-variant-primary' : ''}">${entry.svg}<span class="jpdb-reader-pitch-variant-badge">${percentages[index]}%</span></span>`)
        .join('')}</div>`;
}

// Current pitch banks expose source order, not measured prevalence. For those
// ordinal-only candidates, descending weights (N…1) make the ordering explicit
// as compact display shares that always total 100%. If a future source supplies
// commonality for EVERY variant, those real values determine the shares instead.
export function pitchVariantDisplayPercentages(variants: PitchVariant[]): number[] {
    if (!variants.length) return [];
    const supplied = variants.map(variant => variant.commonality);
    const hasCompleteCommonality = supplied.every(value => Number.isFinite(value) && (value ?? 0) >= 0)
        && supplied.some(value => (value ?? 0) > 0);
    const weights = hasCompleteCommonality
        ? supplied.map(value => value ?? 0)
        : variants.map((_, index) => variants.length - index);
    const total = weights.reduce((sum, value) => sum + value, 0);
    const exact = weights.map(value => value * 100 / total);
    const percentages = exact.map(Math.floor);
    const remainder = 100 - percentages.reduce((sum, value) => sum + value, 0);
    const remainderOrder = exact
        .map((value, index) => ({ index, remainder: value - percentages[index] }))
        .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (let index = 0; index < remainder; index++) percentages[remainderOrder[index].index]++;
    return percentages;
}

export interface ExpressionComponentLookup {
    text: string;
    reading: string;
}

export interface ExpressionComponentPitch extends ExpressionComponentLookup {
    pitch: string;
}

export function alignedExpressionComponentPitches(
    card: Pick<JPDBCard, 'spelling' | 'reading' | 'wordWithReading'>,
    components: ExpressionComponentLookup[],
    componentPitches: ExpressionComponentPitch[],
): ExpressionComponentPitch[] {
    if (components.length < 2 || components.map(component => component.text).join('') !== card.spelling.trim()) return [];
    const aligned = components.map(component => componentPitches.find(pitch =>
        pitch.text === component.text && pitch.reading === component.reading,
    ));
    if (aligned.some(component => !component)) return [];
    if (aligned.map(component => component?.reading ?? '').join('') !== cardPronunciationReading(card)) return [];
    return aligned as ExpressionComponentPitch[];
}

export interface PitchGraphRenderOptions {
    centerContent?: boolean;
}

// Expressions (気合いを入れる) have no pitch of their own; presenting one
// component's accent as the whole expression would be wrong. Instead each
// component gets its own labelled mini graph.
export function renderExpressionComponentPitches(components: ExpressionComponentPitch[]): string {
    const graphs = components
        .map(component => ({
            component,
            svg: renderPitchGraphSvg(component.reading, component.pitch, { centerContent: true }),
        }))
        .filter(entry => entry.svg)
        .map(entry => `<span class="jpdb-reader-pitch-component">
            ${entry.svg}
            <span class="jpdb-reader-pitch-component-label">${escapeHtml(entry.component.text)}</span>
        </span>`);
    if (!graphs.length) return '';
    return `<div class="jpdb-reader-pitch jpdb-reader-pitch-components">${graphs.join('')}</div>`;
}

export function renderPitchGraphSvg(reading: string, pitch: string, options: PitchGraphRenderOptions = {}): string {
    const morae = splitMorae(reading);
    const highs = pitchLevelsForDisplay(pitch, reading);
    if (highs.length < 2) return '';

    const width = morae.length * 24 + 18;
    const startX = options.centerContent ? 21 : 9;
    const point = (index: number) => `${startX + index * 24},${highs[index] === 'H' ? 10 : 29}`;
    const cls = pitchClassNameForPattern(pitch, reading) || 'unknown';
    const points = highs.map((_, index) => point(index)).join(' ');
    return `<svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        <polyline class="${cls}" points="${points}"></polyline>
        ${highs.map((_, index) => `<circle class="${cls}" cx="${startX + index * 24}" cy="${highs[index] === 'H' ? 10 : 29}" r="3"></circle>`).join('')}
        ${morae.map((mora, index) => `<text x="${startX + index * 24}" y="44" text-anchor="middle">${escapeHtml(mora)}</text>`).join('')}
    </svg>`;
}

export function cardPronunciationReading(card: Pick<JPDBCard, 'reading' | 'spelling' | 'wordWithReading'>): string {
    const reading = pronunciationCandidate(card.reading);
    if (reading) return reading;
    const rubyReading = pronunciationCandidate(readingFromWordWithReading(card.wordWithReading ?? ''));
    if (rubyReading) return rubyReading;
    return pronunciationCandidate(card.spelling);
}

export function uniqueKanji(value: string): string[] {
    return [...new Set(Array.from(value).filter(isKanjiCharacter))];
}

export function isKanjiCharacter(value: string): boolean {
    const code = value.codePointAt(0) ?? 0;
    return code >= 0x3400 && code <= 0x9fff;
}

function containsKanji(value: string): boolean {
    return Array.from(value).some(isKanjiCharacter);
}

function cleanPronunciationReading(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

function pronunciationCandidate(value: string): string {
    const reading = cleanPronunciationReading(value);
    if (!reading || containsKanji(reading)) return '';
    return isKanaPronunciation(reading) ? reading : '';
}

function isKanaPronunciation(value: string): boolean {
    return /^[\u3040-\u30ff]+$/u.test(value);
}

function readingFromWordWithReading(value: string): string {
    let reading = '';
    let offset = 0;
    const rubyPattern = /([^\[\]]+)\[([^\]]+)\]/g;
    for (const match of value.matchAll(rubyPattern)) {
        const index = match.index ?? 0;
        reading += unannotatedPronunciationText(value.slice(offset, index));
        reading += match[2] ?? '';
        offset = index + match[0].length;
    }
    reading += unannotatedPronunciationText(value.slice(offset));
    return reading;
}

function unannotatedPronunciationText(value: string): string {
    return Array.from(value).filter(character => !isKanjiCharacter(character)).join('');
}
