import { escapeHtml, renderKanjiNavigationText, renderRuby, shouldRenderRuby } from '../dom/index';
import { normalizedJapaneseCardReading } from './highlight';
import type { HeadwordComponentPitchSegment } from '../popup/pitch';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';

type HeadwordFuriganaCard = Pick<JPDBCard, 'spelling' | 'reading' | 'cardState' | 'partOfSpeech' | 'wordWithReading'>;
type KanjiNavigationOptions = Parameters<typeof renderRuby>[2];

const KANJI_RE = /[\u3400-\u9fff]/u;
const ANNOTATED_READING_RE = /([^\[\]]+)\[([^\]]+)\]/g;
// A bracket reading annotates the kanji run immediately before it (JPDB style:
// \u4e26[\u306a\u3089]\u3079\u66ff[\u304b]\u3048). Interleaved kana between two annotated runs is plain
// base text, never part of the next run's ruby base.
const TRAILING_KANJI_RUN_RE = /([\u3400-\u9fff\u3005\u303b\u30f6]+)$/u;

function compactReading(value: string): string {
    // NFC: imported Anki/local-dictionary readings can arrive decomposed;
    // canonically-equivalent kana must still compare equal to the spelling.
    return value.normalize('NFC').replace(/\s+/g, '').trim();
}

// Card headwords are dictionary entries: their reading belongs on the word as
// furigana whenever ruby data exists. Page-level furigana preferences govern
// annotated page text, not lookup headings. Keeping that distinction absolute
// prevents the same reading from ever falling back to loose kana beside a
// lookup headword when page furigana is disabled.
export function headwordFuriganaSettings(settings: ReaderSettings): ReaderSettings {
    return { ...settings, showFurigana: true, furiganaMode: 'all' };
}

export function renderCardSpellingWithFurigana(
    card: HeadwordFuriganaCard,
    settings: ReaderSettings,
    kanjiNavigation?: KanjiNavigationOptions,
): string {
    const spelling = card.spelling.trim();
    if (!spelling) return '';
    const token = cardSpellingFuriganaToken(card, spelling);
    return shouldRenderRuby(spelling, token, headwordFuriganaSettings(settings), true, true)
        ? renderRuby(spelling, token, kanjiNavigation, true)
        : renderKanjiNavigationText(spelling, kanjiNavigation);
}

export function isPlainReadingRedundantForHeadword(
    card: HeadwordFuriganaCard,
    settings: ReaderSettings,
    plainReading: string,
): boolean {
    const spelling = card.spelling.trim();
    const normalizedPlainReading = compactReading(plainReading);
    if (!spelling || !normalizedPlainReading) return false;
    // A reading identical to the visible word is a pointless repetition
    // (kana-only headwords). Katakana headwords keep their hiragana reading
    // because the strings differ.
    if (normalizedPlainReading === compactReading(spelling)) return true;

    const token = cardSpellingFuriganaToken(card, spelling);
    const visibleReading = headwordFuriganaReading(spelling, token);
    if (!visibleReading || compactReading(visibleReading) !== normalizedPlainReading) return false;
    return shouldRenderRuby(spelling, token, headwordFuriganaSettings(settings), true, true);
}

function cardSpellingFuriganaToken(card: HeadwordFuriganaCard, spelling: string): JPDBToken {
    const rubies = annotatedWordRubies(spelling, card.wordWithReading ?? '');
    const annotatedReading = rubies.length ? readingFromSurfaceRubies(spelling, rubies) : '';
    const reading = annotatedReading || normalizedJapaneseCardReading(spelling, card.reading).trim();
    return {
        card: { ...card, spelling, reading } as JPDBCard,
        start: 0,
        end: spelling.length,
        length: spelling.length,
        rubies,
        pitchClass: '',
        sentence: spelling,
    };
}

function headwordFuriganaReading(spelling: string, token: JPDBToken): string {
    return token.rubies.length
        ? readingFromSurfaceRubies(spelling, token.rubies)
        : normalizedJapaneseCardReading(spelling, token.card.reading).trim();
}

function annotatedWordRubies(spelling: string, annotated: string): JPDBToken['rubies'] {
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

function readingFromSurfaceRubies(surface: string, rubies: JPDBToken['rubies']): string {
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

// Renders a headword whose exact whole-word pitch is missing but whose full
// spelling decomposes into components with exact pitches (利用料金 → 利用 +
// 料金). Each pitched component gets its own presentational underline; the
// spans are decoration only — no dictionary lookup, no jpdb-reader-word
// identity — so the single compound lookup and kanji navigation stay intact.
export function renderHeadwordComponentPitchSpans(
    card: HeadwordFuriganaCard,
    segments: HeadwordComponentPitchSegment[],
    settings: ReaderSettings,
    kanjiNavigation?: KanjiNavigationOptions,
): string {
    const classified = segments.map(segment => ({
        segment,
        pitchClass: segment.pitch ? getPitchClass([segment.pitch.pitch], segment.pitch.reading) : '',
    }));
    if (classified.some(({ segment, pitchClass }) => segment.pitch && !pitchClass)) return '';
    return classified.map(({ segment, pitchClass }) => {
        if (!segment.pitch) return renderKanjiNavigationText(segment.text, kanjiNavigation);
        const { text, reading } = segment.pitch;
        const content = renderCardSpellingWithFurigana({
            ...card,
            spelling: text,
            reading,
            wordWithReading: null,
        }, settings, kanjiNavigation);
        return `<span class="jpdb-reader-pitch-component-headword jpdb-pitch-${pitchClass}" data-pitch-class="${escapeHtml(pitchClass)}">${content}</span>`;
    }).join('');
}
