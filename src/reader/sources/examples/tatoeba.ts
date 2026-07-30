import { requestJson } from '../../network/http';
import { decideMediaLicence } from './licence';
import { TATOEBA_COVERAGE, tatoebaTranslationCode, type TatoebaLanguageCoverage } from './tatoeba-coverage';
import type { LearnerLanguageId } from '../../locales/types';
import {
    noComponent,
    unsupportedCapabilities,
    type ExampleCollection,
    type ExampleRecord,
    type ExampleSearchRequest,
    type ExampleSourceAdapter,
    type ExampleSourceCapabilities,
    type LicensedMediaAsset,
    type WithheldMediaAsset,
} from './types';

export const TATOEBA_EXAMPLE_SOURCE_ID = 'tatoeba';
const TATOEBA_API_BASE = 'https://api.tatoeba.org/v1/sentences';
const TATOEBA_SENTENCE_URL = 'https://tatoeba.org/en/sentences/show';
const DEFAULT_RESULT_LIMIT = 8;
const MAX_RESULT_LIMIT = 20;

/**
 * Tatoeba's rate limiting is not documented as a header contract, so a 429 is
 * treated as "back off for a while" rather than retried. The window doubles per
 * consecutive refusal, exactly like the ImmersionKit client's, and is shared
 * across every language so one hot target cannot starve the others.
 */
const RATE_LIMIT_INITIAL_BACKOFF_MS = 30_000;
const RATE_LIMIT_MAX_BACKOFF_MS = 10 * 60_000;

export interface TatoebaExampleSourceOptions {
    /** Injected for tests and for the recorded-fixture suite. */
    readonly fetchJson?: (url: string, signal: AbortSignal) => Promise<unknown>;
    readonly proxyUrl?: string;
    readonly timeoutMs?: number;
    /**
     * Ask for audio rows. Audio still passes the licence allowlist per file, so
     * this switch controls the request, never the permission.
     */
    readonly requestAudio?: boolean;
    readonly now?: () => number;
}

/**
 * The Tatoeba sentence adapter: text for all 32 configured targets, plus
 * per-file-licensed sentence audio where a contributor released one openly.
 *
 * It never serves Japanese. ImmersionKit already does that with scene images
 * and native audio, and the plan's non-negotiable is that Japanese behaviour
 * stays exactly as it is, so `supports('ja')` answers unsupported and the
 * registry hands Japanese to the ImmersionKit adapter instead.
 */
export function createTatoebaExampleSource(options: TatoebaExampleSourceOptions = {}): ExampleSourceAdapter {
    const now = options.now ?? (() => Date.now());
    let rateLimitedUntil = 0;
    let backoffMs = RATE_LIMIT_INITIAL_BACKOFF_MS;

    const fetchJson = options.fetchJson ?? ((url: string, signal: AbortSignal) => requestJson(url, {
        signal,
        proxyUrl: options.proxyUrl,
        timeoutMs: options.timeoutMs,
        failureLabel: 'Tatoeba examples',
        // Tatoeba is a public read API. Sending credentials would only leak
        // whatever cookie the learner happens to hold for the site.
        anonymous: true,
    }));

    return {
        id: TATOEBA_EXAMPLE_SOURCE_ID,
        name: 'Tatoeba',
        supports: (targetLanguage: string) => tatoebaCapabilitiesFor(targetLanguage),
        async search(request: ExampleSearchRequest): Promise<ExampleCollection<ExampleRecord>> {
            const coverage = coverageFor(request.targetLanguage);
            const term = request.term.trim();
            if (!coverage || !term) return { availability: 'unsupported', items: [] };
            if (now() < rateLimitedUntil) return { availability: 'unavailable', items: [], reason: 'network' };

            const limit = boundedLimit(request.limit);
            const urls = coverage.entry.codes.map(code => searchUrl({
                code,
                term,
                outputLanguage: request.outputLanguage,
                limit,
                requestAudio: options.requestAudio ?? true,
            }));

            const responses = await Promise.all(urls.map(url => resolveResponse(url, request.signal, fetchJson)));
            const failure = responses.find(response => response.kind === 'failure');
            const payloads = responses.filter(response => response.kind === 'payload');
            // A partial answer beats an error page. Serbo-Croatian asks three
            // codes; if Bosnian times out, the Serbian and Croatian sentences
            // are still real sentences.
            if (failure && !payloads.length) {
                if (failure.reason === 'rate-limit') {
                    rateLimitedUntil = now() + backoffMs;
                    backoffMs = Math.min(backoffMs * 2, RATE_LIMIT_MAX_BACKOFF_MS);
                    return { availability: 'unavailable', items: [], reason: 'network' };
                }
                return { availability: 'unavailable', items: [], reason: failure.reason };
            }
            if (!failure) backoffMs = RATE_LIMIT_INITIAL_BACKOFF_MS;

            const withheldMedia: WithheldMediaAsset[] = [];
            const items = payloads
                .flatMap(response => sentenceRows(response.payload))
                .map(row => toExampleRecord(row, coverage, request.outputLanguage, withheldMedia))
                .filter((record): record is ExampleRecord => Boolean(record))
                .slice(0, limit);

            if (!items.length) return { availability: 'empty', items: [] };
            return withheldMedia.length
                ? { availability: 'loaded', items, withheldMedia }
                : { availability: 'loaded', items };
        },
    };
}

/**
 * The per-target capability answer, derived from the measured matrix rather than
 * from a hand-maintained second list.
 */
export function tatoebaCapabilitiesFor(targetLanguage: string): ExampleSourceCapabilities {
    const coverage = coverageFor(targetLanguage);
    if (!coverage) return unsupportedCapabilities();
    const { entry } = coverage;
    const hasSentenceAudio = entry.sentenceAudioRows > 0;
    return {
        supported: true,
        text: {
            availability: 'available',
            scope: 'sentence',
            ...(entry.limitedCorpus ? { reason: 'limited-corpus' as const } : {}),
        },
        audio: hasSentenceAudio
            // Not `available`: the licence is chosen per recording and most of
            // them refuse commercial reuse, so promising audio here would be
            // the Boolean lie U46 exists to remove.
            ? { availability: 'per-item', scope: 'sentence', reason: 'no-licensed-audio' }
            : { availability: 'none', scope: 'sentence', reason: 'no-sentence-audio-source' },
        // No configured language has a general licensed sentence-paired image
        // source. Commons can illustrate a concrete lemma after a semantic and
        // per-file licence check, which is a different feature and is not wired.
        image: noComponent('no-image-source'),
        corpus: entry.limitedCorpus ? 'limited' : 'ample',
        sentenceAudioRows: entry.sentenceAudioRows,
    };
}

interface ResolvedCoverage {
    readonly id: LearnerLanguageId;
    readonly entry: TatoebaLanguageCoverage;
}

/**
 * Strict on purpose. `resolveLearnerLanguage` degrades an unknown tag to
 * English, which for an example source would mean quietly serving English
 * sentences to someone reading a language Tatoeba has not been mapped for.
 */
export function coverageFor(targetLanguage: string): ResolvedCoverage | null {
    const base = targetLanguage.trim().toLowerCase().split(/[-_]/u)[0] ?? '';
    const id = TATOEBA_LANGUAGE_ALIASES[base] ?? base;
    const entry = TATOEBA_COVERAGE[id as LearnerLanguageId];
    return entry ? { id: id as LearnerLanguageId, entry } : null;
}

/** CLDR/Intl legacy tags that resolve onto a configured roster entry. */
const TATOEBA_LANGUAGE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    fil: 'tl',
    sr: 'sh',
    hr: 'sh',
    bs: 'sh',
    cmn: 'zh',
    pes: 'fa',
    prs: 'fa',
    nan: 'zh',
});

function boundedLimit(limit: number | undefined): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_RESULT_LIMIT;
    return Math.max(1, Math.min(MAX_RESULT_LIMIT, Math.trunc(limit)));
}

function searchUrl(params: {
    code: string;
    term: string;
    outputLanguage: string;
    limit: number;
    requestAudio: boolean;
}): string {
    const query = new URLSearchParams({
        lang: params.code,
        // Quoted so the corpus matches the written word instead of every
        // sentence containing its letters.
        q: `"${params.term}"`,
        // `sort` is not optional: the API answers 400 without it.
        sort: 'relevance',
        limit: String(params.limit),
    });
    const translation = tatoebaTranslationCode(params.outputLanguage);
    if (translation) query.set('trans:lang', translation);
    if (params.requestAudio) query.set('include', 'audios');
    return `${TATOEBA_API_BASE}?${query.toString()}`;
}

type ResolvedResponse =
    | { kind: 'payload'; payload: unknown }
    | { kind: 'failure'; reason: 'auth' | 'network' | 'schema' | 'rate-limit' };

async function resolveResponse(
    url: string,
    signal: AbortSignal,
    fetchJson: (url: string, signal: AbortSignal) => Promise<unknown>,
): Promise<ResolvedResponse> {
    try {
        const payload = await fetchJson(url, signal);
        if (!isRecord(payload)) return { kind: 'failure', reason: 'schema' };
        if (!Array.isArray(payload.data)) return { kind: 'failure', reason: 'schema' };
        return { kind: 'payload', payload };
    } catch (error) {
        if (isAbortError(error)) throw error;
        return { kind: 'failure', reason: failureReason(error) };
    }
}

function failureReason(error: unknown): 'auth' | 'network' | 'schema' | 'rate-limit' {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/\b429\b|too many requests/iu.test(message)) return 'rate-limit';
    if (/\b40[13]\b|unauthori[sz]ed|forbidden/iu.test(message)) return 'auth';
    if (/\bjson\b|unexpected token|schema/iu.test(message)) return 'schema';
    return 'network';
}

function sentenceRows(payload: unknown): Record<string, unknown>[] {
    if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
    return payload.data.filter(isRecord);
}

function toExampleRecord(
    row: Record<string, unknown>,
    coverage: ResolvedCoverage,
    outputLanguage: string,
    withheldMedia: WithheldMediaAsset[],
): ExampleRecord | null {
    const value = text(row.text);
    const id = text(row.id);
    if (!value || !id) return null;
    const sentenceLicence = text(row.license) || 'CC BY 2.0 FR';
    const owner = text(row.owner);
    const audio = licensedAudio(row.audios, withheldMedia, coverage);
    return {
        id: `${TATOEBA_EXAMPLE_SOURCE_ID}:${id}`,
        text: {
            value,
            // The row's own `lang`, not the requested one: a Serbo-Croatian
            // search returns Serbian, Croatian and Bosnian rows and each keeps
            // the provenance it arrived with.
            language: text(row.lang) || coverage.entry.codes[0] || coverage.id,
            ...(text(row.script) ? { script: text(row.script) } : {}),
        },
        ...(translationOf(row, outputLanguage) ?? {}),
        ...(audio.length ? { audio } : {}),
        source: {
            name: 'Tatoeba',
            url: `${TATOEBA_SENTENCE_URL}/${id}`,
            licence: sentenceLicence,
            attribution: owner ? `Tatoeba — ${owner}` : 'Tatoeba',
        },
        quality: {
            // `is_unapproved` is Tatoeba's own doubt marker about the sentence.
            reviewed: row.is_unapproved !== true,
            // Owner-contributed rows in the language's own corpus are normally
            // native. A dead language is the exception, and it says so rather
            // than borrowing a claim it cannot support.
            nativeSpeaker: coverage.entry.audioIsReconstruction ? false : Boolean(owner),
            ...(coverage.entry.audioIsReconstruction ? { warnings: ['reconstructed-pronunciation'] } : {}),
        },
    };
}

function translationOf(
    row: Record<string, unknown>,
    outputLanguage: string,
): { translation: ExampleRecord['translation'] } | null {
    const wanted = tatoebaTranslationCode(outputLanguage);
    const candidates = Array.isArray(row.translations) ? row.translations.filter(isRecord) : [];
    const matches = candidates.filter(candidate => text(candidate.text) && (!wanted || text(candidate.lang) === wanted));
    // A direct pair is a human translating this sentence. An indirect one was
    // pivoted through a third language, so it is kept but marked.
    const chosen = matches.find(candidate => candidate.is_direct === true) ?? matches[0];
    if (!chosen) return null;
    return {
        translation: {
            value: text(chosen.text),
            language: text(chosen.lang) || wanted || outputLanguage,
            provenance: 'source',
            direct: chosen.is_direct === true,
        },
    };
}

function licensedAudio(
    raw: unknown,
    withheldMedia: WithheldMediaAsset[],
    coverage: ResolvedCoverage,
): LicensedMediaAsset[] {
    if (!Array.isArray(raw)) return [];
    const assets: LicensedMediaAsset[] = [];
    raw.filter(isRecord).forEach(record => {
        const id = text(record.id);
        const decision = decideMediaLicence(record.license);
        if (!decision.allowed) {
            withheldMedia.push({ kind: 'audio', licence: text(record.license) || '', reason: decision.withheld });
            return;
        }
        if (!id) return;
        const author = text(record.author);
        assets.push({
            kind: 'audio',
            // Never `term`: this file is a reading of the whole sentence.
            scope: 'sentence',
            url: text(record.download_url) || `https://api.tatoeba.org/v1/audio/${id}/file`,
            licence: decision.licence,
            attribution: author
                ? `${author} (Tatoeba${coverage.entry.audioIsReconstruction ? ', reconstructed pronunciation' : ''})`
                : 'Tatoeba',
            // The attribution link the contributor asked for, not a homepage.
            recordUrl: text(record.attribution_url) || `${TATOEBA_SENTENCE_URL}/${id}`,
        });
    });
    return assets;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}
