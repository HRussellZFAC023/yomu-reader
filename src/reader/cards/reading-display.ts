import { escapeHtml, renderKanjiNavigationText, renderRuby, shouldRenderRuby } from '../dom/index';
import { activeLearningTarget } from '../languages/target-runtime';
import type { HeadwordComponentPitchSegment } from '../popup/pitch';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import { annotatedWordRubies, readingFromSurfaceRubies } from '../lookup/annotated-reading';

type HeadwordFuriganaCard = Pick<JPDBCard, 'spelling' | 'reading' | 'cardState' | 'partOfSpeech' | 'wordWithReading'>;
type KanjiNavigationOptions = Parameters<typeof renderRuby>[2];

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
    const reading = annotatedReading || activeLearningTarget().normalizeReading(spelling, card.reading).trim();
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
        : activeLearningTarget().normalizeReading(spelling, token.card.reading).trim();
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
