import type { JPDBToken } from '../app/types';
import {
    KANJI_PATTERN,
    KANJI_RE,
} from './japanese-script';

const ANNOTATED_READING_RE = /([^\[\]]+)\[([^\]]+)\]/g;
// Preserve the old BMP marks exactly (々, 〻, ヶ) while extending the
// ideograph member through the shared property-aware pattern atom.
const TRAILING_KANJI_RUN_RE = new RegExp(`((?:${KANJI_PATTERN}|[々〻ヶ])+)$`, 'u');

export function annotatedWordRubies(spelling: string, annotated: string): JPDBToken['rubies'] {
    if (!annotated || !annotated.includes('[')) return [];
    const rubies: JPDBToken['rubies'] = [];
    let cursor = 0;
    let baseText = '';
    let baseOffset = 0;

    for (const match of annotated.matchAll(ANNOTATED_READING_RE)) {
        const matchIndex = match.index ?? 0;
        const captured = match[1] ?? '';
        const runMatch = captured.match(TRAILING_KANJI_RUN_RE);
        const base = runMatch ? runMatch[1] : captured;
        const plain = annotated.slice(cursor, matchIndex) + captured.slice(0, captured.length - base.length);
        const reading = (match[2] ?? '').trim();

        baseText += plain;
        baseOffset += plain.length;
        const start = baseOffset;
        baseText += base;
        baseOffset += base.length;
        if (base && reading) {
            rubies.push({ text: reading, start, end: start + base.length, length: base.length });
        }
        cursor = matchIndex + match[0].length;
    }

    baseText += annotated.slice(cursor);
    return baseText === spelling ? rubies : [];
}

export function readingFromSurfaceRubies(surface: string, rubies: JPDBToken['rubies']): string {
    let reading = '';
    let offset = 0;
    for (const ruby of rubies.slice().sort((first, second) => first.start - second.start)) {
        if (ruby.start < offset || ruby.end > surface.length || ruby.end <= ruby.start) continue;
        reading += unannotatedPronunciationText(surface.slice(offset, ruby.start));
        reading += ruby.text;
        offset = ruby.end;
    }
    reading += unannotatedPronunciationText(surface.slice(offset));
    return reading;
}

function unannotatedPronunciationText(value: string): string {
    return Array.from(value).filter(character => !KANJI_RE.test(character)).join('');
}
