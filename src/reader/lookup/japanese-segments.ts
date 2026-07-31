import { deinflectJapaneseTerm, type DeinflectedTerm } from './deinflect';
import type { LanguageLookupCandidate } from '../languages/types';
import { uniqueNonEmptyStrings as uniqueStrings } from '../core/string-utils';
import { stablePositiveHashId } from '../core/stable-hash';
import type { JPDBCard } from '../app/types';
import { activeLearningTargetLanguage } from '../languages/target-runtime';
import { codePointSafePrefix } from '../languages/lookup-spans';
import {
    HALFWIDTH_KATAKANA,
    HIRAGANA_WITH_PROLONGED,
    KANA,
    KANJI_PATTERN,
    KANJI_LIKE_WITH_COUNTERS_PATTERN,
    KATAKANA,
    KATAKANA_WITH_PROLONGED,
    PROLONGED_SOUND_MARK,
} from './japanese-script';

export const JAPANESE_SCRIPT_GROUP_RE = new RegExp(
    `${KANJI_LIKE_WITH_COUNTERS_PATTERN}+|[${HIRAGANA_WITH_PROLONGED}]+|[${KATAKANA_WITH_PROLONGED}]+|[${HALFWIDTH_KATAKANA}]+`,
    'gu',
);
const JAPANESE_TEXT_RUN_RE = new RegExp(
    `(?:[${KANA}${PROLONGED_SOUND_MARK}${HALFWIDTH_KATAKANA}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})+`,
    'gu',
);
export const JAPANESE_CHARACTER_RE = new RegExp(
    `(?:[${KANA}${HALFWIDTH_KATAKANA}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})`,
    'u',
);
const FALLBACK_INFLECTION_MAX_SEGMENTS = 8;
const FALLBACK_INFLECTION_MAX_LENGTH = 18;
const FALLBACK_LOOKUP_TERM_LIMIT = 8;
const INFLECTION_BOUNDARY_SEGMENTS = new Set(['は', 'が', 'を', 'に', 'へ', 'と', 'で', 'の', 'や', 'から', 'まで', 'より', 'だけ', 'しか', 'など', 'ね']);
const PARTICLE_PREFIX_SEGMENTS = [...INFLECTION_BOUNDARY_SEGMENTS].sort((first, second) => second.length - first.length);
const PARTICLE_PREFIX_REMAINDER_RE = new RegExp(
    `^(?:[${KATAKANA_WITH_PROLONGED}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})`,
    'u',
);
const INFLECTION_CONTINUATION_SEGMENT_RE = /^(?:っ?た|っ?て|だ|で|ん|んで|ま|ない|なか|なかっ|なかった|ながら|ます|まし|ました|ませ|ません|ましょう|たい|たく|しま|した|し|する|でき|出来|できる|できます|できた|できて|できない|できなかった|いる|い|いた|いて|れる|られ|せる|させる)$/u;
const HIRAGANA_SEGMENT_RE = new RegExp(`^[${HIRAGANA_WITH_PROLONGED}]+$`, 'u');
const KATAKANA_SEGMENT_RE = new RegExp(`^[${KATAKANA}${HALFWIDTH_KATAKANA}${PROLONGED_SOUND_MARK}]+$`, 'u');
// Punctuation an author writes to separate words. The katakana middle dot ・ and
// its halfwidth ･ are the Japanese forms, ゠ separates the parts of a
// transliterated name, and ·/• stand in for ・ in Latin-typeset copy. Written
// out here rather than composed from japanese-script.ts because these are
// exactly the code points that block is wrong about: ・ and ゠ live INSIDE the
// katakana range, so every katakana class silently swallows them.
const SEGMENT_SEPARATORS = '・･゠·•';
const SEGMENT_SEPARATOR_RE = new RegExp(`[${SEGMENT_SEPARATORS}]`, 'u');
const SEGMENT_SEPARATOR_RUN_RE = new RegExp(`[${SEGMENT_SEPARATORS}]+`, 'gu');
const SINGLE_KANJI_SEGMENT_RE = new RegExp(`^${KANJI_PATTERN}$`, 'u');
const SINGLE_KANJI_HIRAGANA_STEM_RE = new RegExp(
    `^${KANJI_PATTERN}[${HIRAGANA_WITH_PROLONGED}]*$`,
    'u',
);
const KANJI_KANA_KANJI_SPAN_RE = new RegExp(
    `${KANJI_LIKE_WITH_COUNTERS_PATTERN}[${HIRAGANA_WITH_PROLONGED}]+${KANJI_LIKE_WITH_COUNTERS_PATTERN}`,
    'u',
);
const HIRAGANA_END_RE = new RegExp(`[${HIRAGANA_WITH_PROLONGED}]$`, 'u');
const TRAILING_POLITE_PARTICLE_RE = /(?:ます|ません|です|でした)ね$/u;
const SURU_STEM_SEGMENT_RE = new RegExp(
    `(?:[${KATAKANA}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})`,
    'u',
);
const SURU_AUXILIARY_SUFFIX_RE = /^(?:し|する|した|して|します|しました|しましょう|しない|でき|出来|できる|できます|できた|できて|できない|できなかった)/u;
const NUMERIC_COUNTER_SUFFIX_SEGMENTS = new Set(['話', '巻', '回', '章', '部', '番', '号', '版', '人', '名', '匹', '頭', '羽', '枚', '本', '冊', '個', '台', '件', '分', '秒', '時', '日', '月', '年', '泊', '円']);
const NUMERIC_RANGE_BEFORE_RE = /(?:第\s*)?(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+)(?:\s*[〜～~\-ー−―–]\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+))*$/u;
const BOGUS_SMALL_TSU_FINAL_RE = /っ[うくぐすずつづぬふぶぷむゆる]$/u;
const SEGMENTER_COMPOUND_OVERRIDES = new Set(['巨乳']);
const SEGMENTER_COMPOUND_OVERRIDE_MAX_LENGTH = Array.from(SEGMENTER_COMPOUND_OVERRIDES)
    .reduce((max, value) => Math.max(max, value.length), 0);
// A pure-kana span only looks like an inflectable verb/adjective base when it
// ends in an i-adjective い or a godan dictionary end (う-row) and carries no
// geminate っ — geminate-bearing kana spans (がっこう, きっぷ) are nouns, never
// verb/adjective dictionary forms, so excluding っ keeps real adjectives like
// やさしい off the merge path while still collapsing kana nouns.
const KANA_VERB_STEM_END_RE = /[うくぐすずつづぬふぶぷむゆる]$/u;
const KANA_I_ADJECTIVE_END_RE = /い$/u;
const SMALL_TSU_RE = /っ/u;
const KANA_CONTENT_WORD_MIN_LENGTH = 3;
// Any kanji or katakana — its presence means a segment is NOT pure hiragana, so
// the kana-merge pass leaves the surrounding (real, mixed-script) sentence alone.
const NON_HIRAGANA_SCRIPT_RE = new RegExp(
    `(?:[${KATAKANA}${HALFWIDTH_KATAKANA}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})`,
    'u',
);

export function normalizeFallbackTerm(text: string): string {
    return codePointSafePrefix(text.replace(/\s+/g, ' ').trim(), 80);
}

// The one fallback-card identity: parser-cached fallback cards and render-side
// remap-gap refills (dom/index.ts) must mint IDENTICAL cards for the same
// surface, so the stable hash and lookup-term derivation live here rather than
// being duplicated per caller.
export function bareFallbackCardFromText(
    text: string,
    language = activeLearningTargetLanguage(),
): JPDBCard {
    const spelling = normalizeFallbackTerm(text);
    const id = -stablePositiveHashId(`fallback\n${language}\n${spelling}`);
    const fallbackLookupTerms = fallbackLookupTermsForText(spelling).slice(1);
    return {
        vid: id,
        sid: id,
        rid: 0,
        spelling,
        reading: '',
        language,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        // Segmented fallback has no dictionary or SRS backing: not-in-deck is a
        // placeholder default, so tag it provisional.
        provisionalState: true,
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
        ...(fallbackLookupTerms.length ? { fallbackLookupTerms } : {}),
    };
}

export type JapaneseTextSegment = { surface: string; start: number; end: number };
type IntlSegmentRecord = { segment: string; index: number; isWordLike?: boolean };
type IntlSegmenter = { segment(value: string): Iterable<IntlSegmentRecord> };
type IntlSegmenterConstructor = new (
    locale: string,
    options: { granularity: 'word' },
) => IntlSegmenter;
let cachedSegmenterConstructor: IntlSegmenterConstructor | null | undefined;
let cachedJapaneseWordSegmenter: IntlSegmenter | null | undefined;

export function fallbackJapaneseSegments(text: string): JapaneseTextSegment[] {
    return segmentJapaneseText(text);
}

export function segmentJapaneseText(text: string): JapaneseTextSegment[] {
    const segmenter = japaneseWordSegmenter();
    if (!segmenter) {
        return Array.from(text.matchAll(JAPANESE_SCRIPT_GROUP_RE)).flatMap(match => {
            const start = match.index ?? 0;
            return finalizeJapaneseRunSegments(fallbackJapaneseRunSegment(match[0], start), text);
        });
    }
    return Array.from(text.matchAll(JAPANESE_TEXT_RUN_RE)).flatMap(match => {
        const start = match.index ?? 0;
        return segmentJapaneseRun(match[0], start, segmenter, text);
    });
}

function segmentJapaneseRun(text: string, offset: number, segmenter: IntlSegmenter, sourceText: string): JapaneseTextSegment[] {
    const segments = Array.from(segmenter.segment(text))
        .filter(isUsefulJapaneseSegment)
        .map(segment => ({
            surface: segment.segment,
            start: offset + segment.index,
            end: offset + segment.index + segment.segment.length,
    }));
    if (segments.at(-1)?.end !== offset + text.length) {
        return finalizeJapaneseRunSegments(fallbackJapaneseRunSegment(text, offset), sourceText);
    }
    return finalizeJapaneseRunSegments(segments, sourceText);
}

function finalizeJapaneseRunSegments(segments: JapaneseTextSegment[], sourceText: string): JapaneseTextSegment[] {
    const separatedSegments = splitNumericCounterPrefixSegments(splitSeparatorSegments(segments), sourceText);
    const normalizedSegments = splitTrailingPoliteParticleSegments(
        mergeContiguousKanaSegments(mergeContiguousKatakanaSegments(mergeSegmenterCompoundOverrides(separatedSegments))),
    );
    return mergeInflectedFallbackSegments(
        splitLeadingParticleSegments(normalizedSegments),
        sourceText,
    );
}

function splitTrailingPoliteParticleSegments(segments: JapaneseTextSegment[]): JapaneseTextSegment[] {
    return segments.flatMap((segment, index) => {
        if (!segment.surface.endsWith('ね') || segment.surface === 'ね') return [segment];
        const previous = segments[index - 1]?.surface ?? '';
        if (!TRAILING_POLITE_PARTICLE_RE.test(`${previous}${segment.surface}`)) return [segment];
        const particleStart = segment.end - 1;
        const stem = segment.surface.slice(0, -1);
        return [
            ...(stem ? [{ surface: stem, start: segment.start, end: particleStart }] : []),
            { surface: 'ね', start: particleStart, end: segment.end },
        ];
    });
}

// A separator is a word boundary the author wrote down, so it has to break the
// token it sits in and must never survive as a lookup-able token of its own.
// The owner's Discord blurb parsed as a SINGLE word —
// ボイス・ビデオ・テキストコミュニケーションサービス — which no dictionary
// carries, so the popover reported "Exact pitch unavailable" for the whole run.
//
// Only ・ (and ゠) were broken, because they are the separators that live inside
// the katakana block: KATAKANA is U+30A0-U+30FF, so KATAKANA_SEGMENT_RE matched
// the dot and `mergeContiguousKatakanaSegments` walked straight through it as if
// it were one more katakana letter. ·/•/･ sit outside every Japanese class and
// already broke runs — this is what makes ・ and ゠ behave like them.
//
// The separator is DROPPED, not kept as its own segment, and that is what makes
// the boundary hard for the whole pipeline instead of for one pass: every later
// merge requires `segment.start === previous.end`, so the hole left behind stops
// all of them at once. Dropping is also what stops 株式会社・A emitting a bare
// punctuation token nobody can look up.
//
// Written as a split rather than as a guard inside the katakana merge because
// only a split is engine-proof: ICU4C (Chromium) isolates the dot and splits the
// tail, ICU4X (Firefox) returns ボイス|・|ビデオ|・|テキストコミュニケーション
// サービス, and both reduce to identical tokens here. A merge-side guard would
// do nothing on any engine that hands back a dotted run as one segment.
//
// This runs inside finalize, never in `segmentJapaneseRun`: dropping a trailing
// separator ahead of that function's `end === offset + text.length` coverage
// guard would make ボイス・ miss coverage and fall back to the whole run as one
// token — the exact misparse being fixed here.
function splitSeparatorSegments(segments: JapaneseTextSegment[]): JapaneseTextSegment[] {
    if (!segments.some(segment => SEGMENT_SEPARATOR_RE.test(segment.surface))) return segments;
    return segments.flatMap(splitSeparatorSegment);
}

function splitSeparatorSegment(segment: JapaneseTextSegment): JapaneseTextSegment[] {
    if (!SEGMENT_SEPARATOR_RE.test(segment.surface)) return [segment];
    const pieces: JapaneseTextSegment[] = [];
    let cursor = 0;
    for (const match of segment.surface.matchAll(SEGMENT_SEPARATOR_RUN_RE)) {
        const index = match.index ?? 0;
        if (index > cursor) pieces.push(separatorFreeSegmentSlice(segment, cursor, index));
        cursor = index + match[0].length;
    }
    if (cursor < segment.surface.length) pieces.push(separatorFreeSegmentSlice(segment, cursor, segment.surface.length));
    return pieces;
}

function separatorFreeSegmentSlice(segment: JapaneseTextSegment, from: number, to: number): JapaneseTextSegment {
    return {
        surface: segment.surface.slice(from, to),
        start: segment.start + from,
        end: segment.start + to,
    };
}

// ICU's `Intl.Segmenter('ja',{granularity:'word'})` has no kana dictionary, so
// it over-splits hiragana-only words on phonetic guesses (にほんご→に|ほん|ご,
// がっこう→が|っ|こう). Those intra-kana boundaries are noise, so a maximal run
// of adjacent, contiguous, pure-hiragana segments is collapsed back into one
// token. This is scoped to runs with NO kanji segment — i.e. hiragana-only
// titles/names (the YouTube case). Mixed kanji+kana sentences are left alone
// because there ICU's kana boundaries are grammatically real (好き|な|もの).
// Within a kana run a boundary is only kept where it is linguistically real: a
// standalone particle segment, or a point where the trailing kana span is
// independently a content word (verb/adjective base or deinflects to one) —
// that preserves genuine splits like ややさしい => や|やさしい and にほんご|の|じかん.
function mergeContiguousKanaSegments(segments: JapaneseTextSegment[]): JapaneseTextSegment[] {
    if (segments.some(segment => NON_HIRAGANA_SCRIPT_RE.test(segment.surface))) return segments;
    const merged: JapaneseTextSegment[] = [];
    for (let index = 0; index < segments.length;) {
        const span = contiguousKanaMergeSpanAt(segments, index);
        if (span) {
            merged.push(span.segment);
            index = span.nextIndex;
            continue;
        }
        merged.push(segments[index]);
        index += 1;
    }
    return merged;
}

// ICU's word segmenter has no kana dictionary for loanwords either, so it
// over-splits katakana compounds on phonetic guesses (イマージョンキット →
// イ|マージ|ョン|キット — ョン even starts on a small kana, an impossible token
// boundary). Unlike hiragana, a contiguous katakana run carries no particles
// or grammar, so the whole run is one orthographic word and merges
// unconditionally; dictionary lookup decomposes compounds downstream.
function mergeContiguousKatakanaSegments(segments: JapaneseTextSegment[]): JapaneseTextSegment[] {
    const merged: JapaneseTextSegment[] = [];
    for (let index = 0; index < segments.length;) {
        const first = segments[index];
        if (!KATAKANA_SEGMENT_RE.test(first.surface)) {
            merged.push(first);
            index += 1;
            continue;
        }
        let surface = first.surface;
        let runEnd = index + 1;
        while (runEnd < segments.length
            && KATAKANA_SEGMENT_RE.test(segments[runEnd].surface)
            && segments[runEnd].start === segments[runEnd - 1].end) {
            surface += segments[runEnd].surface;
            runEnd += 1;
        }
        merged.push(runEnd - index > 1 ? { surface, start: first.start, end: segments[runEnd - 1].end } : first);
        index = runEnd;
    }
    return merged;
}

function contiguousKanaMergeSpanAt(
    segments: JapaneseTextSegment[],
    startIndex: number,
): { segment: JapaneseTextSegment; nextIndex: number } | null {
    const first = segments[startIndex];
    if (!first || !isPureKanaSegment(first.surface)) return null;
    // A particle-shaped first segment is only word-internal (にほんご, がっこう) at
    // the true start of a contiguous kana run. Mid-run — i.e. right after another
    // kana segment that a previous merge already consumed (the standalone の in
    // にほんご|の|じかん) — it is a real boundary, so leave it on its own.
    const previous = segments[startIndex - 1];
    const atKanaRunStart = !previous || !isPureKanaSegment(previous.surface) || previous.end !== first.start;
    if (isBoundarySegment(first.surface) && !atKanaRunStart) return null;
    const runEnd = contiguousKanaRunEnd(segments, startIndex);
    if (runEnd - startIndex < 2) return null;
    let surface = first.surface;
    let lastIndex = startIndex;
    for (let index = startIndex + 1; index < runEnd; index += 1) {
        const current = segments[index];
        const trailingSpan = sliceKanaSpanSurface(segments, index, runEnd);
        // Stop merging at a real boundary: a standalone particle, or a point
        // where the rest of the run stands on its own as a content word.
        if (isBoundarySegment(current.surface) || isKanaContentWordSpan(trailingSpan)) break;
        surface += current.surface;
        lastIndex = index;
    }
    if (lastIndex === startIndex) return null;
    return {
        segment: { surface, start: first.start, end: segments[lastIndex].end },
        nextIndex: lastIndex + 1,
    };
}

function contiguousKanaRunEnd(segments: JapaneseTextSegment[], startIndex: number): number {
    let index = startIndex + 1;
    while (index < segments.length
        && isPureKanaSegment(segments[index].surface)
        && segments[index].start === segments[index - 1].end) {
        index += 1;
    }
    return index;
}

function sliceKanaSpanSurface(segments: JapaneseTextSegment[], startIndex: number, endIndex: number): string {
    let surface = '';
    for (let index = startIndex; index < endIndex; index += 1) surface += segments[index].surface;
    return surface;
}

function isPureKanaSegment(surface: string): boolean {
    return HIRAGANA_SEGMENT_RE.test(surface);
}

// A kana span is treated as a standalone content word (so the boundary before it
// is kept) when it is a plausible verb/adjective dictionary form, or it
// deinflects to one. The geminate っ guard keeps kana nouns (がっこう) — whose
// pseudo-deinflections (がっく/がっい) are bogus — on the merge path.
function isKanaContentWordSpan(span: string): boolean {
    if (isKanaInflectableBaseShape(span)) return true;
    return deinflectJapaneseTerm(span).some(candidate =>
        candidate.depth > 0
        && Array.from(candidate.term).length >= 2
        && !SMALL_TSU_RE.test(candidate.term)
        && (KANA_VERB_STEM_END_RE.test(candidate.term) || KANA_I_ADJECTIVE_END_RE.test(candidate.term)));
}

function isKanaInflectableBaseShape(span: string): boolean {
    if (Array.from(span).length < KANA_CONTENT_WORD_MIN_LENGTH || SMALL_TSU_RE.test(span)) return false;
    return KANA_VERB_STEM_END_RE.test(span) || KANA_I_ADJECTIVE_END_RE.test(span);
}

function splitNumericCounterPrefixSegments(segments: JapaneseTextSegment[], sourceText: string): JapaneseTextSegment[] {
    return segments.flatMap(segment => splitNumericCounterPrefixSegment(segment, sourceText));
}

function splitNumericCounterPrefixSegment(segment: JapaneseTextSegment, sourceText: string): JapaneseTextSegment[] {
    const first = Array.from(segment.surface)[0] ?? '';
    if (!first || first === segment.surface || !NUMERIC_COUNTER_SUFFIX_SEGMENTS.has(first)) return [segment];
    if (!numericRangeImmediatelyBefore(sourceText, segment.start)) return [segment];
    // A counter followed by 間 is a duration word (時間/年間/分間/日間/月間),
    // not a counter glued onto the next title word. Peeling it shattered
    // 3時間前 into 時|間|前 on the keyless/segmented path.
    const second = Array.from(segment.surface)[1] ?? '';
    if (second === '間') return [segment];
    return [
        { surface: first, start: segment.start, end: segment.start + first.length },
        { surface: segment.surface.slice(first.length), start: segment.start + first.length, end: segment.end },
    ];
}

function splitLeadingParticleSegments(segments: JapaneseTextSegment[]): JapaneseTextSegment[] {
    return segments.flatMap(splitLeadingParticleSegment);
}

function splitLeadingParticleSegment(segment: JapaneseTextSegment): JapaneseTextSegment[] {
    const prefix = PARTICLE_PREFIX_SEGMENTS.find(candidate => {
        if (!segment.surface.startsWith(candidate) || segment.surface.length <= candidate.length) return false;
        return PARTICLE_PREFIX_REMAINDER_RE.test(segment.surface.slice(candidate.length));
    });
    if (!prefix) return [segment];
    return [
        { surface: prefix, start: segment.start, end: segment.start + prefix.length },
        { surface: segment.surface.slice(prefix.length), start: segment.start + prefix.length, end: segment.end },
    ];
}

function mergeSegmenterCompoundOverrides(segments: JapaneseTextSegment[]): JapaneseTextSegment[] {
    const merged: JapaneseTextSegment[] = [];
    for (let index = 0; index < segments.length;) {
        const span = segmenterCompoundOverrideSpanAt(segments, index);
        if (span) {
            merged.push(span.segment);
            index = span.nextIndex;
            continue;
        }
        merged.push(segments[index]);
        index += 1;
    }
    return merged;
}

function segmenterCompoundOverrideSpanAt(
    segments: JapaneseTextSegment[],
    startIndex: number,
): { segment: JapaneseTextSegment; nextIndex: number } | null {
    const first = segments[startIndex];
    if (!first) return null;
    let surface = '';
    let best: { segment: JapaneseTextSegment; nextIndex: number } | null = null;
    for (let index = startIndex; index < segments.length; index += 1) {
        const current = segments[index];
        if (!current || (index > startIndex && segments[index - 1]?.end !== current.start)) break;
        surface += current.surface;
        if (surface.length > SEGMENTER_COMPOUND_OVERRIDE_MAX_LENGTH) break;
        if (index > startIndex && SEGMENTER_COMPOUND_OVERRIDES.has(surface)) {
            best = {
                segment: { surface, start: first.start, end: current.end },
                nextIndex: index + 1,
            };
        }
    }
    return best;
}

function mergeInflectedFallbackSegments(segments: JapaneseTextSegment[], sourceText: string): JapaneseTextSegment[] {
    const merged: JapaneseTextSegment[] = [];
    for (let index = 0; index < segments.length;) {
        const span = inflectedFallbackSpanAt(segments, index, sourceText);
        if (span) {
            merged.push(span.segment);
            index = span.nextIndex;
            continue;
        }
        merged.push(segments[index]);
        index += 1;
    }
    return merged;
}

function inflectedFallbackSpanAt(
    segments: JapaneseTextSegment[],
    startIndex: number,
    sourceText: string,
): { segment: JapaneseTextSegment; nextIndex: number } | null {
    const first = segments[startIndex];
    if (!first || isBoundarySegment(first.surface)) return null;
    let surface = '';
    let best: { segment: JapaneseTextSegment; nextIndex: number } | null = null;
    for (let index = startIndex; index < fallbackInflectionScanEnd(segments, startIndex); index += 1) {
        const current = nextInflectedFallbackSegment(segments, index, startIndex, first, surface, sourceText);
        if (!current) break;
        surface += current.surface;
        if (surface.length > FALLBACK_INFLECTION_MAX_LENGTH) break;
        best = inflectedFallbackCandidateAt(segments, startIndex, index, first, current, surface) ?? best;
    }
    return best;
}

function fallbackInflectionScanEnd(segments: JapaneseTextSegment[], startIndex: number): number {
    return Math.min(segments.length, startIndex + FALLBACK_INFLECTION_MAX_SEGMENTS);
}

function nextInflectedFallbackSegment(
    segments: JapaneseTextSegment[],
    index: number,
    startIndex: number,
    first: JapaneseTextSegment,
    surface: string,
    sourceText: string,
): JapaneseTextSegment | null {
    const current = segments[index];
    if (!current || !isContiguousFallbackSegment(segments, index, startIndex, first)) return null;
    if (index > startIndex && isNumericCounterFallbackStem(first, sourceText)) return null;
    const politeNegativePast = index > startIndex && isPoliteNegativePastContinuation(segments, index, surface);
    if (index > startIndex && isBoundarySegment(current.surface) && !politeNegativePast) return null;
    if (index > startIndex && !politeNegativePast && !canContinueInflectedFallbackSpan(surface, current.surface)) return null;
    return current;
}

function isPoliteNegativePastContinuation(segments: JapaneseTextSegment[], index: number, surface: string): boolean {
    return surface.endsWith('ません')
        && segments[index]?.surface === 'で'
        && segments[index + 1]?.surface === 'した';
}

function isContiguousFallbackSegment(
    segments: JapaneseTextSegment[],
    index: number,
    startIndex: number,
    first: JapaneseTextSegment,
): boolean {
    const expectedStart = index === startIndex ? first.start : segments[index - 1]?.end;
    return segments[index]?.start === expectedStart;
}

function inflectedFallbackCandidateAt(
    segments: JapaneseTextSegment[],
    startIndex: number,
    index: number,
    first: JapaneseTextSegment,
    current: JapaneseTextSegment,
    surface: string,
): { segment: JapaneseTextSegment; nextIndex: number } | null {
    if (index === startIndex) return null;
    const lookupTerms = fallbackLookupTermsForText(surface);
    if (lookupTerms.length <= 1) return null;
    if (shouldKeepSuruAuxiliaryBoundary(segments, startIndex, surface, lookupTerms)) return null;
    return {
        segment: { surface, start: first.start, end: current.end },
        nextIndex: index + 1,
    };
}

export function isBoundarySegment(surface: string): boolean {
    return INFLECTION_BOUNDARY_SEGMENTS.has(surface);
}

function isInflectionContinuationSegment(surface: string): boolean {
    return INFLECTION_CONTINUATION_SEGMENT_RE.test(surface);
}

function canContinueInflectedFallbackSpan(currentSurface: string, nextSurface: string): boolean {
    return isInflectionContinuationSegment(nextSurface)
        || (SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface)
            && HIRAGANA_END_RE.test(currentSurface)
            && SINGLE_KANJI_SEGMENT_RE.test(nextSurface))
        || (HIRAGANA_SEGMENT_RE.test(nextSurface)
            && (SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface)
                || KANJI_KANA_KANJI_SPAN_RE.test(currentSurface))
            && !hasUsefulFallbackDeinflection(currentSurface));
}

function isNumericCounterFallbackStem(segment: JapaneseTextSegment, sourceText: string): boolean {
    return NUMERIC_COUNTER_SUFFIX_SEGMENTS.has(segment.surface)
        && numericRangeImmediatelyBefore(sourceText, segment.start);
}

function numericRangeImmediatelyBefore(sourceText: string, start: number): boolean {
    const before = sourceText.slice(Math.max(0, start - 24), start).replace(/\s+$/u, '');
    return NUMERIC_RANGE_BEFORE_RE.test(before);
}

function hasUsefulFallbackDeinflection(surface: string): boolean {
    return fallbackLookupTermsForText(surface).length > 1;
}

function shouldKeepSuruAuxiliaryBoundary(
    segments: JapaneseTextSegment[],
    startIndex: number,
    surface: string,
    lookupTerms: string[],
): boolean {
    const first = segments[startIndex]?.surface ?? '';
    if (!first || !SURU_STEM_SEGMENT_RE.test(first)) return false;
    const suffix = surface.slice(first.length);
    if (!SURU_AUXILIARY_SUFFIX_RE.test(suffix)) return false;
    if (hasSingleKanjiGodanSAlternative(first, lookupTerms)) return false;
    return true;
}

function hasSingleKanjiGodanSAlternative(first: string, lookupTerms: string[]): boolean {
    return SINGLE_KANJI_SEGMENT_RE.test(first)
        && lookupTerms.some(term => term === `${first}す`);
}

function japaneseWordSegmenter(): IntlSegmenter | null {
    const Segmenter = intlSegmenter();
    if (!Segmenter) {
        cachedSegmenterConstructor = null;
        cachedJapaneseWordSegmenter = null;
        return null;
    }
    if (cachedSegmenterConstructor !== Segmenter) {
        cachedSegmenterConstructor = Segmenter;
        cachedJapaneseWordSegmenter = new Segmenter('ja', { granularity: 'word' });
    }
    return cachedJapaneseWordSegmenter ?? null;
}

function isUsefulJapaneseSegment(segment: IntlSegmentRecord): boolean {
    const surface = segment.segment.trim();
    return JAPANESE_CHARACTER_RE.test(surface);
}

function intlSegmenter(): IntlSegmenterConstructor | null {
    const candidate = (Intl as unknown as { Segmenter?: IntlSegmenterConstructor }).Segmenter;
    return typeof candidate === 'function' ? candidate : null;
}

function fallbackJapaneseRunSegment(text: string, offset: number): JapaneseTextSegment[] {
    const surface = text.trim();
    if (!surface || !JAPANESE_CHARACTER_RE.test(surface)) return [];
    const start = offset + text.indexOf(surface);
    return [{ surface, start, end: start + surface.length }];
}

export function fallbackLookupTermsForText(text: string): string[] {
    const source = normalizeFallbackTerm(text);
    if (!source) return [];
    const terms = deinflectJapaneseTerm(source)
        .filter(isUsefulFallbackLookupCandidate)
        .sort(compareFallbackLookupCandidates)
        .map(candidate => normalizeFallbackTerm(candidate.term))
        .filter(Boolean);
    return uniqueStrings([source, ...terms]).slice(0, FALLBACK_LOOKUP_TERM_LIMIT);
}

export function fallbackDictionaryLookupTermsForText(text: string): string[] {
    const terms = fallbackLookupTermsForText(text);
    return dictionaryFirstFallbackLookupTerms(terms, hasAmbiguousContinuativeStemCandidate(terms[0] ?? ''));
}

export function fallbackLookupTermsForCard(card: JPDBCard): string[] {
    const terms = uniqueStrings([card.spelling, ...(card.fallbackLookupTerms ?? [])]
        .map(normalizeFallbackTerm)
        .filter(Boolean));
    return dictionaryFirstFallbackLookupTerms(terms, hasAmbiguousContinuativeStemCandidate(terms[0] ?? ''));
}

function isUsefulFallbackLookupCandidate(candidate: DeinflectedTerm): boolean {
    return candidate.depth > 0
        && JAPANESE_CHARACTER_RE.test(candidate.term)
        && candidate.term.length > 1;
}

/**
 * Japanese's own ranking of two analyses of one surface, wired into the
 * learning-target contract as `compareLookupCandidates` and used verbatim by
 * the fallback path above.
 *
 * It lives here, exported, because both callers must stay identical: this
 * ordering decides which dictionary form survives the eight-term cap, so if
 * the contract seam and the fallback path ever ranked differently the same
 * word would resolve differently depending on which door the caller came
 * through. 食べられなかった is the standing example — drop the rule priority and
 * 食べる, the dictionary form, falls off the end of the list entirely.
 */
export function compareJapaneseLookupCandidates(
    a: LanguageLookupCandidate,
    b: LanguageLookupCandidate,
): number {
    return a.depth - b.depth
        || fallbackRulePriority(a) - fallbackRulePriority(b)
        || b.term.length - a.term.length
        || a.term.localeCompare(b.term);
}

const compareFallbackLookupCandidates = compareJapaneseLookupCandidates;

function fallbackRulePriority(candidate: LanguageLookupCandidate): number {
    if (candidate.rules.some(rule => rule === 'vs' || rule === 'vs-s' || rule === 'suru' || rule === 'vk' || rule === 'kuru')) return 0;
    if (candidate.rules.some(rule => rule === 'v1')) return 1;
    if (candidate.rules.some(rule => rule.startsWith('v5') || rule === 'v5')) return 1;
    if (candidate.rules.some(rule => rule === 'adj-i' || rule === 'i-adj')) return 2;
    return 3;
}

function dictionaryFirstFallbackLookupTerms(terms: string[], sourceFirst = false): string[] {
    const [source, ...candidates] = terms;
    const terminal = candidates.filter(isTerminalDictionaryFallbackTerm);
    return uniqueStrings(sourceFirst
        ? [source ?? '', ...terminal, ...candidates]
        : [...terminal, ...candidates, source ?? '']);
}

function hasAmbiguousContinuativeStemCandidate(source: string): boolean {
    return deinflectJapaneseTerm(source).some(candidate =>
        candidate.depth === 1
        && candidate.reasons.length === 1
        && candidate.reasons[0] === 'continuative stem');
}

function isTerminalDictionaryFallbackTerm(term: string): boolean {
    return !BOGUS_SMALL_TSU_FINAL_RE.test(term) && fallbackLookupTermsForText(term).length <= 1;
}
