import { escapeHtml } from '../dom/index';
import { contextPitchPattern, pitchClassNameForPattern, pitchLevelsForDisplay, splitMorae } from '../lookup/pitch-accent';
import { localPitchPatternFromMeta } from '../lookup/pitch-meta';
import type { JPDBCard } from '../app/types';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';

export function renderPitch(card: JPDBCard, metaEntries: YomitanMetaEntry[] = []): string {
    const reading = cardPronunciationReading(card);
    const pitch = contextPitchPattern(card.pitchAccent, reading)
        || localPitchPatternFromMeta(reading || card.reading, metaEntries);
    if (!pitch) return '';

    if (!reading) return '';
    const graph = renderPitchGraphSvg(reading, pitch);
    return graph ? `<div class="jpdb-reader-pitch">${graph}</div>` : '';
}

export interface ExpressionComponentPitch {
    text: string;
    reading: string;
    pitch: string;
}

// Expressions (気合いを入れる) have no pitch of their own; presenting one
// component's accent as the whole expression would be wrong. Instead each
// component gets its own labelled mini graph.
export function renderExpressionComponentPitches(components: ExpressionComponentPitch[]): string {
    const graphs = components
        .map(component => ({ component, svg: renderPitchGraphSvg(component.reading, component.pitch) }))
        .filter(entry => entry.svg)
        .map(entry => `<span class="jpdb-reader-pitch-component">
            ${entry.svg}
            <span class="jpdb-reader-pitch-component-label">${escapeHtml(entry.component.text)}</span>
        </span>`);
    if (!graphs.length) return '';
    return `<div class="jpdb-reader-pitch jpdb-reader-pitch-components">${graphs.join('')}</div>`;
}

function renderPitchGraphSvg(reading: string, pitch: string): string {
    const morae = splitMorae(reading);
    const highs = pitchLevelsForDisplay(pitch, reading);
    if (highs.length < 2) return '';

    const width = morae.length * 24 + 18;
    const points = highs.map((level, index) => `${9 + index * 24},${level === 'H' ? 10 : 29}`).join(' ');
    const cls = pitchClassNameForPattern(pitch, reading) || 'unknown';
    return `<svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        <polyline class="${cls}" points="${points}"></polyline>
        ${highs.map((level, index) => `<circle class="${cls}" cx="${9 + index * 24}" cy="${level === 'H' ? 10 : 29}" r="3"></circle>`).join('')}
        ${morae.map((mora, index) => `<text x="${9 + index * 24}" y="44" text-anchor="middle">${escapeHtml(mora)}</text>`).join('')}
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
