const PITCH_LEVELS = new Set(['H', 'L']);
const SMALL_KANA = new Set('ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ\u3099\u309A');
const PRONUNCIATION_KANA = /^[\u3040-\u30ff\u3099\u309A]+$/u;

export type PitchClassName = 'atamadaka' | 'odaka' | 'heiban' | 'nakadaka' | 'kifuku';

interface PitchProfile {
    reading: string;
    morae: string[];
    pitchNumber: number | null;
    pattern: string;
    className: PitchClassName | '';
}

interface PitchClassRule {
    className: PitchClassName;
    matches: (pitchNumber: number, moraCount: number) => boolean;
}

const PITCH_CLASS_RULES: PitchClassRule[] = [
    { className: 'heiban', matches: pitchNumber => pitchNumber === 0 },
    { className: 'atamadaka', matches: pitchNumber => pitchNumber === 1 },
    { className: 'odaka', matches: (pitchNumber, moraCount) => pitchNumber === moraCount },
    { className: 'nakadaka', matches: (pitchNumber, moraCount) => pitchNumber > 1 && pitchNumber < moraCount },
];

function normalizePitchPatternForReading(pattern: string, reading: string): string {
    const levels = pitchLevels(pattern);
    if (!levels.length) return '';
    return normalizePitchLevelsForReading(levels, reading).join('');
}

export function normalizePitchPatternsForReading(patterns: string[] | null | undefined, reading: string): string[] {
    return (patterns ?? [])
        .map(pattern => normalizePitchPatternForReading(pattern, reading))
        .filter(Boolean);
}

export function pitchLevelsForDisplay(pattern: string, reading: string): string[] {
    return normalizePitchPatternForReading(pattern, reading).slice(0, countMorae(reading)).split('');
}

function pitchLevels(pattern: string): string[] {
    return Array.from(pattern).filter(level => PITCH_LEVELS.has(level));
}

export function splitMorae(reading: string): string[] {
    if (!PRONUNCIATION_KANA.test(reading)) return [];
    const morae: string[] = [];
    for (const char of Array.from(reading)) {
        if (morae.length && SMALL_KANA.has(char)) morae[morae.length - 1] += char;
        else morae.push(char);
    }
    return morae;
}

function countMorae(reading: string): number {
    return splitMorae(reading).length;
}

export function pitchPatternFromPosition(reading: string, position: number): string {
    const moraCount = countMorae(reading);
    if (!moraCount || !Number.isInteger(position) || position < 0 || position > moraCount) return '';
    if (position === 0) return `L${'H'.repeat(moraCount)}`;
    if (position === 1) return `H${'L'.repeat(moraCount)}`;
    const highMorae = position - 1;
    const lowTail = moraCount - position + 1;
    return `L${'H'.repeat(highMorae)}${'L'.repeat(lowTail)}`;
}

function pitchProfileForPattern(pattern: string, reading: string): PitchProfile {
    const normalized = normalizePitchPatternForReading(pattern, reading);
    const morae = splitMorae(reading);
    const pitchNumber = pitchNumberFromPattern(normalized, reading);
    return {
        reading,
        morae,
        pitchNumber,
        pattern: normalized,
        className: pitchClassNameFromProfile(normalized, morae.length, pitchNumber),
    };
}

export function pitchClassNameForPattern(pattern: string, reading: string): PitchClassName | '' {
    return pitchProfileForPattern(pattern, reading).className;
}

// CSS gradient painting one compound underline with each constituent's own
// accent colour, stops weighted by the morae each constituent contributes.
// Horizontal-first: vertical writing keeps the blend (graphics-tier tradeoff).
export function compoundPitchGradientCss(segments: Array<{ pattern: string; reading: string }>): string {
    if (segments.length < 2) return '';
    // Weight by the MORAE each constituent spans in the visible text: the
    // final constituent's pattern also carries the unwritten particle level,
    // which must not widen its share of the underline.
    const moraCounts = segments.map(segment => splitMorae(segment.reading).length);
    const total = moraCounts.reduce((sum, count) => sum + count, 0);
    if (!total) return '';
    let cursor = 0;
    const stops = segments.map((segment, index) => {
        const from = (cursor / total) * 100;
        cursor += moraCounts[index];
        const to = (cursor / total) * 100;
        const className = pitchClassNameForPattern(segment.pattern, segment.reading) || 'unknown';
        return `var(--jpdb-reader-pitch-${className}) ${from.toFixed(1)}% ${to.toFixed(1)}%`;
    });
    return `linear-gradient(to right, ${stops.join(', ')})`;
}

// One accepted accent variant of a reading. `commonality` is a real source
// weight/percentage when available for every variant. Today's sources (JPDB
// array order, Kanjium row order) are ordinal-only, so it stays undefined;
// presentation derives clearly relative display shares from that ordering.
export interface PitchVariant {
    pattern: string;
    position: number | null;
    commonality?: number;
}

// Shared candidate collection for every surface that shows accent variants
// (popup header, study reveal, listen feedback/grading): source order kept,
// contour-deduped, unclassifiable patterns dropped.
export function collectPitchVariants(reading: string, patterns: string[], max = Infinity): PitchVariant[] {
    const seen = new Set<string>();
    const variants: PitchVariant[] = [];
    for (const pattern of patterns) {
        if (pitchClassNameForPattern(pattern, reading) === '' || !pitchLevelsForDisplay(pattern, reading).join('')) continue;
        const position = pitchNumberFromPattern(pattern, reading);
        // Dedupe by accent IDENTITY (downstep position), not display contour:
        // heiban vs odaka differ only on the particle mora the graph omits, yet
        // are distinct accepted accents (双子 0/3).
        const key = position != null ? `#${position}` : pitchLevelsForDisplay(pattern, reading).join('');
        if (seen.has(key)) continue;
        seen.add(key);
        variants.push({ pattern, position });
        if (variants.length >= max) break;
    }
    return variants;
}

// Every downstep position some listed variant produces — a listen pick matching
// ANY of them is honestly correct when the audio's variant is unknowable.
export function validPitchPositions(reading: string, patterns: string[]): Set<number> {
    const positions = new Set<number>();
    for (const variant of collectPitchVariants(reading, patterns)) {
        if (variant.position != null) positions.add(variant.position);
    }
    return positions;
}

// A card can carry several pitch variants (e.g. dictionary-form vs the
// reading actually used in this sentence). Pick the first variant that fits
// the contextual reading's mora count instead of blindly using the first.
export function contextPitchPattern(patterns: string[] | null | undefined, reading: string): string {
    if (!patterns?.length) return '';
    if (!reading) return patterns[0];
    return patterns.find(pattern => pitchClassNameForPattern(pattern, reading) !== '') ?? '';
}

// Single source of truth for a word's pitch IDENTITY: the accent (downstep) mora
// number of the contextual reading — 0 = heiban (no drop), 1 = atamadaka, N = odaka.
// Used for the listen-mode SRS item key (`${reading}#${pitchNumber}`), minimal-pair
// bucketing, and the position-picker option count. Returns null when no pattern
// resolves for the reading (non-kana, empty, or unclassifiable shape) so callers can
// skip un-identifiable words rather than mis-key them.
export function pitchNumberForReading(patterns: string[] | null | undefined, reading: string): number | null {
    if (!reading || !patterns?.length) return null;
    const pattern = contextPitchPattern(patterns, reading);
    if (!pattern) return null;
    return pitchNumberFromPattern(pattern, reading);
}

function pitchNumberFromPattern(pattern: string, reading: string): number | null {
    const levels = pitchLevels(normalizePitchPatternForReading(pattern, reading));
    const moraCount = countMorae(reading);
    if (!moraCount) return null;
    if (levels.length < moraCount) {
        return looksLikeShortHeibanPattern(levels) ? 0 : null;
    }
    const dropAt = levels.findIndex((level, index) => index > 0 && levels[index - 1] === 'H' && level === 'L');
    if (dropAt === -1) return levels[0] === 'L' ? 0 : null;
    return dropAt;
}

function looksLikeShortHeibanPattern(levels: string[]): boolean {
    return levels.length >= 2 && levels[0] === 'L' && levels.slice(1).every(level => level === 'H');
}

function pitchClassNameFromProfile(pattern: string, moraCount: number, pitchNumber: number | null): PitchClassName | '' {
    if (!moraCount) return '';
    if (pitchNumber != null) return PITCH_CLASS_RULES.find(rule => rule.matches(pitchNumber, moraCount))?.className ?? '';
    return hasComplexPitchShape(pattern) ? 'kifuku' : '';
}

function hasComplexPitchShape(pattern: string): boolean {
    const levels = pitchLevels(pattern);
    return countPitchTransitions(levels, 'L', 'H') > 1 || countPitchTransitions(levels, 'H', 'L') > 1;
}

function countPitchTransitions(levels: string[], from: string, to: string): number {
    let count = 0;
    for (let index = 1; index < levels.length; index++) {
        if (levels[index - 1] === from && levels[index] === to) count++;
    }
    return count;
}

function normalizePitchLevelsForReading(levels: string[], reading: string): string[] {
    const chars = Array.from(reading);
    if (!levels.length || !chars.some(char => SMALL_KANA.has(char))) return levels;
    if (!looksCharacterAlignedPitch(levels, chars)) return levels;

    const normalized: string[] = [];
    for (let index = 0; index < Math.min(chars.length, levels.length); index++) {
        if (normalized.length && SMALL_KANA.has(chars[index])) continue;
        normalized.push(levels[index]);
    }
    return normalized.concat(levels.slice(chars.length));
}

function looksCharacterAlignedPitch(levels: string[], chars: string[]): boolean {
    if (levels.length > splitMorae(chars.join('')).length + 1) return true;
    if (levels.length < chars.length) return false;
    return chars.some((char, index) => index > 0 && SMALL_KANA.has(char) && levels[index] === levels[index - 1]);
}
