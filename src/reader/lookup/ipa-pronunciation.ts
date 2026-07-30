import type { YomitanMetaEntry } from '../dictionaries/yomitan/types';

export interface IpaPronunciation {
    ipa: string;
    dictionary: string;
}

export interface IpaPronunciationMatch {
    expression: string;
    reading?: string;
}

type IpaPayload = { reading?: unknown; transcriptions?: unknown };

// Yomitan IPA rows: [expression, "ipa", { reading, transcriptions: [{ ipa }] }].
export function extractIpaPronunciations(
    entries: readonly YomitanMetaEntry[],
    match: IpaPronunciationMatch,
): IpaPronunciation[] {
    const forms = [match.expression, match.reading ?? ''].map(normalizeLookupForm);
    const result: IpaPronunciation[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
        const data = entry.data as IpaPayload;
        if (entry.mode !== 'ipa'
            || !forms.includes(normalizeLookupForm(entry.expression ?? ''))
            || !data
            || typeof data !== 'object'
            || !Array.isArray(data.transcriptions)) continue;
        if (data.reading
            && (typeof data.reading !== 'string' || !forms.includes(normalizeLookupForm(data.reading)))) continue;
        for (const transcription of data.transcriptions) {
            const value = transcription == null ? undefined : (transcription as { ipa?: unknown }).ipa;
            if (typeof value !== 'string') continue;
            const ipa = value.trim();
            if (!ipa || seen.has(ipa)) continue;
            seen.add(ipa);
            result.push({ ipa, dictionary: entry.dictionary });
        }
    }
    return result;
}

function normalizeLookupForm(value: string): string {
    return value.normalize('NFKC').trim().toLowerCase();
}
