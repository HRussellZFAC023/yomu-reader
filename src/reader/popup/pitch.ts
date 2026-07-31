import { escapeHtml } from '../dom/index';
import {
    collectPitchVariants,
    pitchClassNameForPattern,
    pitchLevelsForDisplay,
    splitMorae,
    type PitchVariant,
} from '../lookup/pitch-accent';
import { localPitchPatternsFromMeta } from '../lookup/pitch-meta';
import { isUnifiedIdeograph } from '../languages/han';
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
        ...localPitchPatternsFromMeta(card.spelling, reading, metaEntries),
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
    const fit = pitchVariantBlockFit(reading, graphs.length);
    return `<div class="jpdb-reader-pitch jpdb-reader-pitch-variants" data-pitch-fit="${fit}">${graphs
        .map((entry, index) => `<span class="jpdb-reader-pitch-component jpdb-reader-pitch-variant${index === 0 ? ' jpdb-reader-pitch-variant-primary' : ''}">${entry.svg}<span class="jpdb-reader-pitch-variant-badge">${percentages[index]}%</span></span>`)
        .join('')}</div>`;
}

// Whether a multi-variant graph block is narrow enough to sit in the header's
// top-right tools row beside the audio button, or wide enough that it must drop
// to its own full-width row so the headword isn't squeezed. All variants share
// the same reading, so every mini graph is the same width. The estimate mirrors
// the rendered geometry: each graph SVG is `morae*24 + 18` wide (co-located in
// renderPitchGraphSvg below, and both call the same splitMorae so the mora count
// can't drift) inside a `.jpdb-reader-pitch-variant` chip whose 6px side padding
// + 1px border add 14px, joined by an 8px flex column-gap.
// KEEP IN SYNC with the chip geometry in styles/kanji.css (.jpdb-reader-pitch-variant
// padding/border, .jpdb-reader-pitch-variants gap) — if those change, update 14/8 here.
// styles/popover-core.css then keeps a "compact" block top-right until the popup
// is genuinely narrow; a "wide" block always demotes on narrow popups.
const PITCH_VARIANT_COMPACT_MAX_WIDTH = 300;

export function pitchVariantBlockFit(reading: string, graphCount: number): 'compact' | 'wide' {
    const graphWidth = splitMorae(reading).length * 24 + 18;
    const chipWidth = graphWidth + 14;
    const blockWidth = graphCount * chipWidth + Math.max(0, graphCount - 1) * 8;
    return blockWidth <= PITCH_VARIANT_COMPACT_MAX_WIDTH ? 'compact' : 'wide';
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

// Particles and connective kana that join expression components (気合いを入れる,
// 為すがまま) or trail a content word (実際は). They carry no lexical pitch of
// their own, so alignment may consume them without demanding a pitch entry.
export const EXPRESSION_CONNECTIVE_KANA = new Set(['を', 'が', 'に', 'で', 'と', 'は', 'も', 'へ', 'や', 'の', 'お', 'ご']);

function matchesAt(characters: string[], cursor: number, value: string): boolean {
    return Array.from(value).every((part, index) => characters[cursor + index] === part);
}

function isConnectiveKanaOnly(component: ExpressionComponentLookup): boolean {
    const characters = Array.from(component.text);
    return characters.length > 0
        && component.text === component.reading
        && characters.every(character => EXPRESSION_CONNECTIVE_KANA.has(character));
}

// One contiguous run of the card's spelling: either a component with an
// aligned pitch, a connective-kana-only component, or a skipped connective
// run between/around components. `pitch` is null for the latter two, which
// lets headword rendering keep connective kana plain while still covering
// the full spelling for a lossless re-render.
export interface HeadwordComponentPitchSegment {
    text: string;
    pitch: ExpressionComponentPitch | null;
}

// Aligns the looked-up components against the card's spelling AND reading,
// tolerating connective kana between and around them: 為すがまま aligns
// 為す + まま across the が, and 実際は aligns 実際 before the trailing は. A
// component that fails to match either text or reading in sequence still voids
// the whole alignment — the substrings would no longer line up.
//
// A content component with NO pitch is treated by `mode`. Strict (headword
// spans, whole-contour paint) voids the whole alignment, because a
// partially-labelled contour painted across the headword would silently
// misattribute accents to the un-pitched spans. Permissive (the labelled
// mini-graph fallback, where each pitched component draws its OWN isolated
// graph) keeps the un-pitched component as a null segment so the components
// that DO have an accent still each render — 賛成票率順 shows 賛成's graph even
// when 票率順 has no bank entry.
function alignExpressionComponentSegments(
    card: Pick<JPDBCard, 'spelling' | 'reading' | 'wordWithReading'>,
    components: ExpressionComponentLookup[],
    componentPitches: ExpressionComponentPitch[],
    mode: 'strict' | 'permissive' = 'strict',
): HeadwordComponentPitchSegment[] | null {
    if (!components.length) return null;
    const spellingChars = Array.from(card.spelling.trim());
    const readingChars = Array.from(cardPronunciationReading(card));
    const segments: HeadwordComponentPitchSegment[] = [];
    let spellingCursor = 0;
    let readingCursor = 0;
    let hadSkippedConnective = false;
    const skipConnectives = (next?: ExpressionComponentLookup) => {
        let run = '';
        while (spellingCursor < spellingChars.length
            && spellingChars[spellingCursor] === readingChars[readingCursor]
            && EXPRESSION_CONNECTIVE_KANA.has(spellingChars[spellingCursor])
            && !(next && matchesAt(spellingChars, spellingCursor, next.text) && matchesAt(readingChars, readingCursor, next.reading))) {
            run += spellingChars[spellingCursor];
            spellingCursor += 1;
            readingCursor += 1;
            hadSkippedConnective = true;
        }
        if (run) segments.push({ text: run, pitch: null });
    };
    for (const component of components) {
        skipConnectives(component);
        if (!matchesAt(spellingChars, spellingCursor, component.text) || !matchesAt(readingChars, readingCursor, component.reading)) return null;
        const text = spellingChars.slice(spellingCursor, spellingCursor + Array.from(component.text).length).join('');
        spellingCursor += Array.from(component.text).length;
        readingCursor += Array.from(component.reading).length;
        const pitch = componentPitches.find(candidate => candidate.text === component.text && candidate.reading === component.reading);
        if (pitch) {
            segments.push({ text, pitch });
            continue;
        }
        if (isConnectiveKanaOnly(component)) {
            hadSkippedConnective = true;
            segments.push({ text, pitch: null });
            continue;
        }
        if (mode === 'permissive') {
            segments.push({ text, pitch: null });
            continue;
        }
        return null;
    }
    skipConnectives();
    if (spellingCursor !== spellingChars.length || readingCursor !== readingChars.length) return null;
    const aligned = segments.filter(segment => segment.pitch);
    if (!aligned.length) return null;
    // A single component covering the whole spelling is just the word itself;
    // the whole-word pitch path owns that case. With particles consumed, the
    // lone content word's accent is genuinely informative (実際は → 実際). The
    // permissive fallback gates on the DECOMPOSITION being real (≥2 components,
    // or a component plus a trimmed connective) rather than on how many
    // components happened to carry a pitch, so a compound where only one
    // morpheme is pitched still surfaces that morpheme's graph.
    const meaningfulSpan = mode === 'permissive' ? components.length : aligned.length;
    if (meaningfulSpan < 2 && !hadSkippedConnective) return null;
    return segments;
}

// The labelled mini-graph fallback: each component that has a pitch draws its
// own isolated graph, so a partially-pitched decomposition is still worth
// showing. Permissive alignment keeps the un-pitched components as null
// segments (dropped by the filter) instead of voiding the whole set.
export function alignedExpressionComponentPitches(
    card: Pick<JPDBCard, 'spelling' | 'reading' | 'wordWithReading'>,
    components: ExpressionComponentLookup[],
    componentPitches: ExpressionComponentPitch[],
): ExpressionComponentPitch[] {
    const segments = alignExpressionComponentSegments(card, components, componentPitches, 'permissive');
    if (!segments) return [];
    return segments.map(segment => segment.pitch).filter((pitch): pitch is ExpressionComponentPitch => Boolean(pitch));
}

// Segments covering the entire headword spelling, for rendering per-component
// pitch decoration on the headword itself. Strict by design: a headword span
// paints one continuous contour, so partial or misaligned evidence yields no
// decoration at all rather than misattributing accents to un-pitched spans.
// (The labelled mini-graph fallback tolerates partial evidence instead.)
export function headwordComponentPitchSegments(
    card: Pick<JPDBCard, 'spelling' | 'reading' | 'wordWithReading'>,
    components: ExpressionComponentLookup[],
    componentPitches: ExpressionComponentPitch[],
): HeadwordComponentPitchSegment[] {
    return alignExpressionComponentSegments(card, components, componentPitches) ?? [];
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
    if (!highs.length || highs.length !== morae.length) return '';

    const width = morae.length * 24 + 18;
    const startX = options.centerContent ? 21 : 9;
    const point = (index: number) => `${startX + index * 24},${highs[index] === 'H' ? 10 : 29}`;
    const cls = pitchClassNameForPattern(pitch, reading) || 'unknown';
    const points = highs.map((_, index) => point(index)).join(' ');
    return `<svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        ${highs.length > 1 ? `<polyline class="${cls}" points="${points}"></polyline>` : ''}
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
    return isUnifiedIdeograph(value);
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
