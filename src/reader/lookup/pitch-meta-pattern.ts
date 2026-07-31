import { normalizePitchPatternsForReading, pitchNumberForReading, pitchPatternFromPosition } from './pitch-accent';
import { activeLearningTarget } from '../languages/target-runtime';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';
import { COMBINING_KANA_MARKS, KANA } from './japanese-script';

export type PitchMetaLookup = (expression: string) => Promise<YomitanMetaEntry[]>;

export interface LocalPitchPatternLookupOptions {
    initialEntries?: YomitanMetaEntry[];
}

export interface LocalPitchResolution {
    patterns: string[];
}

export async function localPitchPatternsFromMetaLookup(
    spelling: string,
    reading: string,
    lookupMeta: PitchMetaLookup,
    options: LocalPitchPatternLookupOptions = {},
): Promise<string[]> {
    return (await localPitchResolutionFromMetaLookup(spelling, reading, lookupMeta, options)).patterns;
}

export async function localPitchResolutionFromMetaLookup(
    spelling: string,
    reading: string,
    lookupMeta: PitchMetaLookup,
    options: LocalPitchPatternLookupOptions = {},
): Promise<LocalPitchResolution> {
    const expression = spelling.trim();
    const pronunciation = reading.trim();
    if (!expression || !pronunciation) return { patterns: [] };
    const initialEntries = options.initialEntries ?? await lookupMeta(expression);
    const patterns = localPitchPatternsFromMeta(expression, pronunciation, initialEntries);
    if (patterns.length) return { patterns };
    return { patterns: await deconjugatedHeibanPitchPatterns(expression, pronunciation, lookupMeta) };
}

const DECONJUGATION_PITCH_CANDIDATE_LIMIT = 4;
const KANA_SUFFIX_RE = new RegExp(`^[${KANA}${COMBINING_KANA_MARKS}]*$`, 'u');

// Pitch dictionaries key on dictionary forms, so entries whose lemma is itself
// inflected (問わず, 〜て/〜ます forms a provider lexicalised) miss the exact
// lookup even though their base verb is listed. Deinflect and project the base
// accent — but ONLY a heiban (accentless) base, which stays heiban in every
// conjugation; an accented base moves its downstep per inflection type, and a
// guessed position would paint a confidently wrong accent.
async function deconjugatedHeibanPitchPatterns(expression: string, reading: string, lookupMeta: PitchMetaLookup): Promise<string[]> {
    const candidates = activeLearningTarget().lookupCandidates(expression)
        .filter(candidate => candidate.term !== expression)
        .slice(0, DECONJUGATION_PITCH_CANDIDATE_LIMIT);
    for (const candidate of candidates) {
        const baseReading = deconjugatedReading(expression, candidate.term, reading);
        if (!baseReading) continue;
        const basePatterns = localPitchPatternsFromMeta(candidate.term, baseReading, await lookupMeta(candidate.term));
        if (!basePatterns.length) continue;
        const heiban = basePatterns.some(pattern => pitchNumberForReading([pattern], baseReading) === 0);
        return heiban ? [pitchPatternFromPosition(reading, 0)].filter(Boolean) : [];
    }
    return [];
}

// The inflected suffix is the same kana run on the spelling and its reading
// (問わず/とわず both end わず), so the base reading follows from replaying the
// spelling's suffix swap on the reading. Bail on any non-kana difference — that
// means the deinflection rewrote more than a conjugation suffix.
function deconjugatedReading(expression: string, baseTerm: string, reading: string): string {
    const expressionChars = Array.from(expression);
    const baseChars = Array.from(baseTerm);
    let shared = 0;
    while (shared < expressionChars.length && shared < baseChars.length && expressionChars[shared] === baseChars[shared]) shared++;
    const removed = expressionChars.slice(shared).join('');
    const added = baseChars.slice(shared).join('');
    if (!KANA_SUFFIX_RE.test(removed) || !KANA_SUFFIX_RE.test(added)) return '';
    if (removed && !reading.endsWith(removed)) return '';
    const stem = removed ? reading.slice(0, reading.length - removed.length) : reading;
    if (!stem && !added) return '';
    return stem + added;
}

export function localPitchPatternFromMeta(expression: string, reading: string, entries: YomitanMetaEntry[]): string {
    return localPitchPatternsFromMeta(expression, reading, entries)[0] ?? '';
}

// UT-65: words commonly carry several accepted accents — pitch dictionaries
// list them all, so surface every distinct pattern instead of the first hit.
export function localPitchPatternsFromMeta(expression: string, reading: string, entries: YomitanMetaEntry[]): string[] {
    const normalizedExpression = expressionIdentity(expression);
    const normalizedReading = readingIdentity(reading);
    if (!normalizedExpression || !normalizedReading) return [];
    return collectPitchPatterns(normalizedExpression, normalizedReading, reading, entries);
}

function collectPitchPatterns(
    normalizedExpression: string,
    normalizedReading: string,
    reading: string,
    entries: YomitanMetaEntry[],
): string[] {
    const patterns: string[] = [];
    for (const entry of entries) {
        if (entry.mode !== 'pitch') continue;
        if (expressionIdentity(entry.expression ?? '') !== normalizedExpression) continue;
        for (const candidate of readPitchCandidates(entry.data, normalizedReading)) {
            const pattern = pitchPatternFromCandidate(reading, candidate);
            if (pattern && !patterns.includes(pattern)) patterns.push(pattern);
        }
    }
    return patterns;
}

function readPitchCandidates(value: unknown, normalizedReading: string): Array<number | string> {
    const record = objectRecord(value);
    if (!record || !pitchMetadataReadingMatches(record, normalizedReading)) return [];
    const candidates = pitchPositionCandidates(record)
        .map(candidate => pitchCandidateFromValue(candidate))
        .filter((candidate): candidate is number | string => candidate != null);
    if (candidates.length) return candidates;
    const direct = pitchCandidateFromValue(record.position);
    return direct == null ? [] : [direct];
}

function pitchPatternFromCandidate(reading: string, candidate: number | string): string {
    return typeof candidate === 'number'
        ? pitchPatternFromPosition(reading, candidate)
        : normalizePitchPatternsForReading([candidate], reading)[0] ?? '';
}

function pitchMetadataReadingMatches(record: Record<string, unknown>, normalizedReading: string): boolean {
    const metadataReading = typeof record.reading === 'string' ? record.reading : '';
    // Kanjium stores hiragana readings while parsed cards often carry the
    // katakana surface — a script difference is not a different reading.
    return readingIdentity(metadataReading) === normalizedReading;
}

function expressionIdentity(value: string): string {
    return value.trim().normalize('NFKC');
}

function readingIdentity(value: string): string {
    return expressionIdentity(value)
        .replace(/[ァ-ヶ]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function pitchPositionCandidates(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
}

function pitchCandidateFromValue(value: unknown): number | string | null {
    const direct = directPitchCandidateValue(value);
    if (direct !== null) return direct;
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return pitchCandidateFromValue(record.position);
}

function directPitchCandidateValue(value: unknown): number | string | null {
    if (typeof value === 'number') return validPitchPosition(value);
    if (typeof value === 'string' && value.trim()) {
        const trimmed = value.trim();
        if (/^[HL]+$/i.test(trimmed)) return trimmed.toUpperCase();
        return validPitchPosition(Number(trimmed));
    }
    return null;
}

function validPitchPosition(value: number): number | null {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}
