import type { YomuGamingLookupRequest, YomuGamingLookupResponse } from './ipc';

const LOOKUP_TIMEOUT_MS = 9_000;
const JISHO_ENDPOINT = 'https://jisho.org/api/v1/search/words';
const MAX_GLOSSES = 4;

// Inline dictionary lookup for an OCR'd term. Runs in the main process so it is not
// bound by the overlay renderer's strict connect-src CSP, and keeps the result on the
// device. Public, unauthenticated jisho.org data — the same surface the hosted reader uses.
export async function lookupGamingTerm(request: YomuGamingLookupRequest): Promise<YomuGamingLookupResponse> {
    const term = (request?.term ?? '').trim();
    if (!term) return { ok: false, error: 'No term to look up.' };
    try {
        const url = `${JISHO_ENDPOINT}?keyword=${encodeURIComponent(term)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
        try {
            const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
            if (!response.ok) throw new Error(`Dictionary lookup returned ${response.status}.`);
            const body = await response.json() as JishoResponse;
            const entry = pickEntry(body, term);
            return entry ? { ok: true, entry } : { ok: true, entry: undefined };
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return { ok: false, error: 'Dictionary lookup timed out.' };
        return { ok: false, error: error instanceof Error ? error.message : 'Dictionary lookup failed.' };
    }
}

interface JishoResponse {
    data?: JishoEntry[];
}

interface JishoEntry {
    is_common?: boolean;
    japanese?: { word?: string; reading?: string }[];
    senses?: { english_definitions?: string[]; parts_of_speech?: string[] }[];
}

function pickEntry(body: JishoResponse, term: string): YomuGamingLookupResponse['entry'] {
    const data = Array.isArray(body?.data) ? body.data : [];
    if (!data.length) return undefined;
    const exact = data.find(entry => entry.japanese?.some(form => form.word === term || form.reading === term));
    const entry = exact ?? data[0];
    const primary = entry.japanese?.[0] ?? {};
    const sense = entry.senses?.[0] ?? {};
    const glosses = (sense.english_definitions ?? []).slice(0, MAX_GLOSSES);
    return {
        term,
        word: primary.word || primary.reading || term,
        reading: primary.reading || '',
        glosses,
        partsOfSpeech: (sense.parts_of_speech ?? []).slice(0, 3),
        common: Boolean(entry.is_common),
    };
}
