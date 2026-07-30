import type { YomitanMetaEntry } from '../dictionaries/yomitan/types';

export interface IpaPronunciation {
    ipa: string;
    dictionary: string;
}

export interface IpaPronunciationMatch {
    expression: string;
    reading?: string;
}

/**
 * Reads the Yomitan IPA metadata shape used by the published Wiktionary
 * pronunciation dictionaries:
 *
 *   ["gratis", "ipa", {
 *     "reading": "gratis",
 *     "transcriptions": [{ "ipa": "/ˈɡɾatis/" }]
 *   }]
 *
 * Expression and reading checks happen before extracting payloads so metadata
 * for a different homograph/reading cannot leak into the current lookup.
 */
export function extractIpaPronunciations(
    entries: readonly YomitanMetaEntry[],
    match: IpaPronunciationMatch,
): IpaPronunciation[] {
    const lookupForms = normalizedLookupForms(match);
    if (!lookupForms.size) return [];

    const pronunciations: IpaPronunciation[] = [];
    const seenIpa = new Set<string>();
    for (const entry of entries) {
        if (entry.mode.trim().toLowerCase() !== 'ipa') continue;
        if (!matchesLookupForm(entry.expression, lookupForms)) continue;
        const data = ipaDataRecord(entry.data);
        if (!data || !matchesLookupForm(data.reading, lookupForms, true)) continue;
        for (const transcription of ipaTranscriptions(data.transcriptions)) {
            if (seenIpa.has(transcription)) continue;
            seenIpa.add(transcription);
            pronunciations.push({ ipa: transcription, dictionary: entry.dictionary });
        }
    }
    return pronunciations;
}

function normalizedLookupForms(match: IpaPronunciationMatch): Set<string> {
    return new Set([match.expression, match.reading]
        .filter((value): value is string => typeof value === 'string')
        .map(normalizeLookupForm)
        .filter(Boolean));
}

function normalizeLookupForm(value: string): string {
    return value.normalize('NFKC').trim().toLowerCase();
}

function matchesLookupForm(value: unknown, lookupForms: Set<string>, optional = false): boolean {
    if (value === undefined || value === null || value === '') return optional;
    if (typeof value !== 'string' || !value.trim()) return false;
    return lookupForms.has(normalizeLookupForm(value));
}

function ipaDataRecord(value: unknown): { reading?: unknown; transcriptions?: unknown } | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as { reading?: unknown; transcriptions?: unknown }
        : null;
}

function ipaTranscriptions(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => item && typeof item === 'object' && !Array.isArray(item)
            ? (item as { ipa?: unknown }).ipa
            : undefined)
        .filter((ipa): ipa is string => typeof ipa === 'string')
        .map(ipa => ipa.trim())
        .filter(Boolean);
}
