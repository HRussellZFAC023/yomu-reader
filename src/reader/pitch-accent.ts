const PITCH_LEVELS = new Set(['H', 'L']);
const SMALL_KANA = new Set('ゃゅょぁぃぅぇぉャュョァィゥェォ');

export function normalizePitchPatternForReading(pattern: string, reading: string): string {
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

export function pitchLevels(pattern: string): string[] {
    return Array.from(pattern).filter(level => PITCH_LEVELS.has(level));
}

export function splitMorae(reading: string): string[] {
    const morae: string[] = [];
    for (const char of Array.from(reading)) {
        if (morae.length && SMALL_KANA.has(char)) morae[morae.length - 1] += char;
        else morae.push(char);
    }
    return morae;
}

export function countMorae(reading: string): number {
    return splitMorae(reading).length;
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
