import { escapeHtml } from '../dom';
import { pitchClassNameForPattern, pitchLevelsForDisplay, splitMorae } from '../pitch-accent';
import { localPitchPatternFromMeta } from '../pitch-meta';
import type { JPDBCard } from '../types';
import type { YomitanMetaEntry } from '../yomitan';

export function renderPitch(card: JPDBCard, metaEntries: YomitanMetaEntry[] = []): string {
    const reading = cardPronunciationReading(card);
    const pitch = card.pitchAccent[0] || localPitchPatternFromMeta(reading || card.reading, metaEntries);
    if (!pitch) return '';

    if (!reading) return '';
    const morae = splitMorae(reading);
    const highs = pitchLevelsForDisplay(pitch, reading);
    if (highs.length < 2) return '';

    const width = morae.length * 24 + 18;
    const points = highs.map((level, index) => `${9 + index * 24},${level === 'H' ? 10 : 29}`).join(' ');
    const cls = pitchClassNameForPattern(pitch, reading) || 'unknown';
    return `<div class="jpdb-reader-pitch"><svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        <polyline class="${cls}" points="${points}"></polyline>
        ${highs.map((level, index) => `<circle class="${cls}" cx="${9 + index * 24}" cy="${level === 'H' ? 10 : 29}" r="3"></circle>`).join('')}
        ${morae.map((mora, index) => `<text x="${9 + index * 24}" y="44" text-anchor="middle">${escapeHtml(mora)}</text>`).join('')}
    </svg></div>`;
}

export function cardPronunciationReading(card: Pick<JPDBCard, 'reading' | 'spelling' | 'wordWithReading'>): string {
    const reading = cleanPronunciationReading(card.reading);
    if (reading && !containsKanji(reading)) return reading;
    const rubyReading = cleanPronunciationReading(readingFromWordWithReading(card.wordWithReading ?? ''));
    if (rubyReading && !containsKanji(rubyReading)) return rubyReading;
    const kanaSpelling = cleanPronunciationReading(card.spelling);
    return isKanaPronunciation(kanaSpelling) ? kanaSpelling : '';
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
