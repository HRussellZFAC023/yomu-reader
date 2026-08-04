import {
    audioSubSourceNameKey,
    audioSubSourceProviderName,
    disabledAudioSubSourceNameKeys,
    normalizeAttemptedAudioUrl,
    type AudioCandidate,
} from './source-resolution';
import { requestAudioUrl as requestUrl, type AudioRequestOptions } from './request';
import { readBlobAsDataUrl } from '../core/blob-data-url';
import { targetAudioTemplateLanguageToken } from '../languages/resolve';
import { isAppleTouchBrowser } from '../platform/browser';
import { uiText } from '../app/i18n';
import { jpdbAudioPageSourceUrl, jpdbAudioRequest, normalizeJpdbAudioIds } from '../jpdb/jpdb-audio-file';
import { jpdbVocabularyIdentityFromUrl as parseJpdbVocabularyUrlIdentity } from '../jpdb/jpdb-vocabulary-url';
import { isKnownCorsBlockedPublicAudioCdnUrl } from '../network/proxy-fetch';
import { escapeRegExp, uniqueStrings } from '../core/string-utils';
import { getUserscriptHttpRequest } from '../userscript/index';
import { jitenTtsVoicesForValue, jitenWordTtsUrl } from './jiten-tts';
import type { AudioSelectionMode, AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from '../app/types';
import { attempt, parseJson } from '../core/attempt';

const JAPANESE_POD_101_UNAVAILABLE_SIZE = 52288;
const JAPANESE_POD_101_UNAVAILABLE_SHA256 = 'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906';
const LOOPBACK_AUDIO_HOSTS = new Set(['localhost', '127.0.0.1']);
const KANA_ONLY_RE = /^[\u3040-\u30ffー・]+$/u;
const JPDB_VOCABULARY_BASE_URL = 'https://jpdb.io/vocabulary';
const JPDB_SEARCH_URL = 'https://jpdb.io/search';
const JITEN_VOCABULARY_SEARCH_URL = 'https://api.jiten.moe/api/vocabulary/search';
const JPDB_TTS_VOICE_PREFIXES: Record<string, string[]> = {
    female: ['f'],
    male: ['m'],
    f1: ['f1'],
    f2: ['f2'],
    m1: ['m1'],
    m2: ['m2'],
};
const JISHO_TEXT_PROXY_BASE_URL = 'https://r.jina.ai/http://jisho.org/search';
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const AUDIO_QUERY_PLACEHOLDER_RE = /\{(?:term|reading)\}/;
const AUDIO_PRECONNECT_RELS = ['preconnect', 'dns-prefetch'] as const;
const preconnectedAudioOrigins = new Set<string>();

interface JitenAudioReference {
    wordId: number;
    readingIndex: number;
}

export function formatAudioUrl(template: string, card: JPDBCard): string {
    const replacements: Record<string, string> = {
        term: card.spelling,
        reading: card.reading,
        language: targetAudioTemplateLanguageToken(),
    };

    return template.replace(/\{(term|reading|language)\}/g, (_, key: string) =>
        encodeURIComponent(replacements[key] ?? ''),
    );
}

export function findAudioUrl(value: unknown, sourceUrl?: string, mode: AudioSelectionMode = 'first'): string | null {
    const urls = findAudioUrls(value, sourceUrl);
    if (!urls.length) return null;
    return mode === 'random' ? urls[Math.floor(Math.random() * urls.length)] : urls[0];
}

export function findAudioUrls(value: unknown, sourceUrl?: string): string[] {
    const direct = directAudioUrlsForValue(value, sourceUrl);
    return direct ?? [];
}

export function blobToDataUrl(blob: Blob, language: ReaderSettings['interfaceLanguage'] = 'en'): Promise<string> {
    return readBlobAsDataUrl(blob, uiText(language, 'couldNotReadAudio'));
}

export async function fetchAudioBlob(
    url: string,
    sourceUrl: string,
    timeoutMs: number,
    mode: AudioSelectionMode,
    proxyUrl: string,
    language: ReaderSettings['interfaceLanguage'] = 'en',
): Promise<Blob> {
    const response = await requestUrl(url, 'blob', timeoutMs, { proxyUrl, language });
    if (isJsonAudioResponse(response)) {
        const nestedUrl = findAudioUrl(JSON.parse(await response.text()), sourceUrl, mode);
        if (!nestedUrl) throw new Error(uiText(language, 'audioJsonMissingPlayableUrl'));
        return fetchAudioBlob(nestedUrl, sourceUrl, timeoutMs, mode, proxyUrl, language);
    }
    if (!(response instanceof Blob)) throw new Error(uiText(language, 'audioSourceReturnedNoAudio'));
    await assertPlayableAudioBlob(response, url, sourceUrl, language);
    return response;
}

function directAudioUrlsForValue(value: unknown, sourceUrl?: string): string[] | null {
    if (!value) return [];
    if (typeof value === 'string') return findAudioUrlsInString(value, sourceUrl);
    return structuredAudioUrlsForValue(value, sourceUrl);
}

export function shouldForceBlobAudioPlayback(sourceType: AudioSourceType): boolean {
    return sourceType === 'jpod101';
}

// JapanesePod101 URLs must go through the blob path whatever source produced
// them (the hosted Yomu source hands them out too): only the blob fetch can
// recognise and reject the endpoint's fixed "not available" placeholder clip.
export function shouldForceBlobAudioCandidate(candidate: AudioCandidate): boolean {
    return isKnownCorsBlockedPublicAudioCdnUrl(candidate.url)
        || isKnownCorsBlockedPublicAudioCdnUrl(candidate.sourceUrl)
        || isJapanesePod101Url(candidate.url)
        || isJapanesePod101Url(candidate.sourceUrl);
}

export function shouldFetchDirectMediaAsBlob(url: string): boolean {
    return /^https?:\/\//i.test(url) && !isLoopbackAudioUrl(url);
}

export function shouldFetchMediaUrlAsBlobBeforePlayback(url: string): boolean {
    return isKnownCorsBlockedPublicAudioCdnUrl(url);
}

function structuredAudioUrlsForValue(value: unknown, sourceUrl?: string): string[] | null {
    if (Array.isArray(value)) return uniqueAudioUrls(value.flatMap(item => findAudioUrls(item, sourceUrl)));
    return typeof value === 'object' ? findAudioUrlsInRecord(value as Record<string, unknown>, sourceUrl) : null;
}

function findAudioUrlsInString(value: string, sourceUrl?: string): string[] {
    if (value.startsWith('data:audio/')) return [value];
    if (/^https?:\/\//.test(value) && isLikelyAudioUrl(value)) return [normalizeAudioUrl(value, sourceUrl)];
    return uniqueAudioUrls(Array.from(value.matchAll(/https?:\/\/[^\s)"'<>\]]+/gi))
        .map(match => match[0])
        .filter(isLikelyAudioUrl)
        .map(url => normalizeAudioUrl(url, sourceUrl)));
}

function findAudioUrlsInRecord(record: Record<string, unknown>, sourceUrl?: string): string[] {
    const known = uniqueAudioUrls([...preferredAudioRecordUrls(record, sourceUrl), ...directAudioRecordUrls(record, sourceUrl)]);
    return known.length ? known : nestedAudioRecordUrls(record, sourceUrl);
}

function preferredAudioRecordUrls(record: Record<string, unknown>, sourceUrl?: string): string[] {
    return ['audioSources', 'sources', 'audio', 'audioUrl', 'src', 'source']
        .flatMap(key => findAudioUrls(record[key], sourceUrl));
}

function directAudioRecordUrls(record: Record<string, unknown>, sourceUrl?: string): string[] {
    return typeof record.url === 'string' && isLikelyAudioRecord(record)
        ? findAudioUrls(record.url, sourceUrl)
        : [];
}

function nestedAudioRecordUrls(record: Record<string, unknown>, sourceUrl?: string): string[] {
    const knownKeys = new Set(['url', 'audioSources', 'sources', 'audio', 'audioUrl', 'src', 'source']);
    return uniqueAudioUrls(Object.entries(record)
        .filter(([key]) => !knownKeys.has(key))
        .flatMap(([, nested]) => findAudioUrls(nested, sourceUrl)));
}

export async function isUnavailableJapanesePod101Audio(blob: Blob): Promise<boolean> {
    if (blob.size !== JAPANESE_POD_101_UNAVAILABLE_SIZE) return false;
    try {
        const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        const hash = [...new Uint8Array(digest)]
            .map(value => value.toString(16).padStart(2, '0'))
            .join('');
        return hash === JAPANESE_POD_101_UNAVAILABLE_SHA256;
    } catch {
        return true;
    }
}

function isJsonAudioResponse(response: unknown): response is Blob {
    return response instanceof Blob && response.type.includes('json');
}

async function assertPlayableAudioBlob(response: Blob, url: string, sourceUrl: string, language: ReaderSettings['interfaceLanguage'] = 'en'): Promise<void> {
    if (isErrorDocumentAudioBlob(response) || (!isLikelyAudioBlob(response) && !isLikelyAudioUrl(url) && !isLikelyAudioUrl(sourceUrl))) {
        throw new Error(formatNonAudioResponseMessage(language, response.type));
    }
    if ((isJapanesePod101Url(url) || isJapanesePod101Url(sourceUrl)) && await isUnavailableJapanesePod101Audio(response)) {
        throw new Error(uiText(language, 'japanesePod101NoAudio'));
    }
}

function formatNonAudioResponseMessage(language: ReaderSettings['interfaceLanguage'], contentType: string): string {
    const label = contentType || uiText(language, 'audioUnknownContentType');
    return uiText(language, 'audioRequestReturnedNonAudioWithType').replace('{type}', label);
}

function isErrorDocumentAudioBlob(blob: Blob): boolean {
    const type = blob.type.toLowerCase();
    return type.startsWith('text/') || ['html', 'xml', 'json'].some(marker => type.includes(marker));
}

function isLikelyAudioBlob(blob: Blob): boolean {
    return blob.type.toLowerCase().startsWith('audio/');
}

export async function getAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<AudioCandidate[]> {
    return await (AUDIO_CANDIDATE_LOADERS[source.type] ?? loadNoAudioCandidates)(source, card, timeoutMs, proxyUrl);
}

export function shouldCacheAudioCandidates(source: AudioSourceSetting, candidates: AudioCandidate[]): boolean {
    if (!candidates.length) return false;
    return source.type !== 'jpdb-tts' || candidates.length > 1;
}

type AudioCandidateLoader = (source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string) => Promise<AudioCandidate[]>;

const AUDIO_CANDIDATE_LOADERS: Partial<Record<AudioSourceType, AudioCandidateLoader>> = {
    custom: loadCustomAudioCandidates,
    'custom-json': loadCustomJsonAudioCandidates,
    jpod101: loadJapanesePod101AudioCandidates,
    'language-pod-101': loadLanguagePod101AudioCandidates,
    jisho: async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getJishoAudioUrls(card, timeoutMs, proxyUrl)),
    bunpro: async (source, card) => bunproPronunciationAudioCandidates(source, card),
    'lingua-libre': async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, 'lingua-libre', timeoutMs, proxyUrl)),
    wiktionary: async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, 'wiktionary', timeoutMs, proxyUrl)),
    'jiten-tts': async (source, card, timeoutMs, proxyUrl) => jitenTtsAudioCandidates(source, card, timeoutMs, proxyUrl),
    'jpdb-tts': async (source, card, timeoutMs, proxyUrl) => jpdbAudioIdsToCandidates(filterJpdbAudioIdsForVoice(await getJpdbTtsAudioIds(card, timeoutMs, proxyUrl), source.voice)),
};

async function loadNoAudioCandidates(): Promise<AudioCandidate[]> {
    return [];
}

// Bunpro's pronunciation CDN serves public per-word recordings at a
// deterministic URL keyed by the word's spelling — no API call and no auth.
// The CDN sends no CORS headers, so the blob/Web-Audio path routes via the
// worker proxy (see KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS).
const BUNPRO_PRONUNCIATION_AUDIO_BASE_URL = 'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/pronunciation/';
const BUNPRO_AUDIO_VOICES = ['female', 'male'] as const;

async function bunproPronunciationAudioCandidates(source: AudioSourceSetting, card: JPDBCard): Promise<AudioCandidate[]> {
    const word = card.spelling.trim();
    if (!word || !JAPANESE_TEXT_RE.test(word)) return [];
    const voiceFilter = source.voice.trim().toLowerCase();
    return BUNPRO_AUDIO_VOICES
        .filter(voice => !voiceFilter || voice === voiceFilter)
        .map(voice => {
            const url = `${BUNPRO_PRONUNCIATION_AUDIO_BASE_URL}${encodeURIComponent(word)}-${voice}.mp3`;
            return { url, sourceUrl: url };
        });
}

async function loadCustomAudioCandidates(source: AudioSourceSetting, card: JPDBCard): Promise<AudioCandidate[]> {
    if (!source.url.trim()) return [];
    const url = formatAudioUrl(source.url, card);
    return [{ url, sourceUrl: url }];
}

async function loadCustomJsonAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<AudioCandidate[]> {
    const template = source.url.trim();
    if (!template) return [];
    const sourceUrl = formatAudioUrl(withAudioQueryPlaceholders(template), card);
    const response = await requestUrl(sourceUrl, 'text', timeoutMs, { proxyUrl });
    if (typeof response !== 'string') return [];
    return customJsonAudioCandidates(JSON.parse(response), source, sourceUrl);
}

// Aggregator endpoints (Yomitan "audioSourceList" responses, e.g. the hosted
// Yomu source) name each clip's upstream provider. Users can untick providers
// per source in Settings; unnamed/plain JSON responses cannot be filtered and
// keep the generic URL extraction.
function customJsonAudioCandidates(payload: unknown, source: AudioSourceSetting, sourceUrl: string): AudioCandidate[] {
    const named = namedAudioSubSources(payload);
    recordAudioSubSourceNames(source.url, named.map(entry => audioSubSourceProviderName(entry.name)));
    const disabled = disabledAudioSubSourceNameKeys(source);
    if (named.length && disabled.size) {
        const allowed = named.filter(entry => !disabled.has(audioSubSourceNameKey(entry.name)));
        return uniqueAudioUrls(allowed.flatMap(entry => findAudioUrls(entry.url, sourceUrl)))
            .map(url => ({ url, sourceUrl }));
    }
    return findAudioUrls(payload, sourceUrl).map(url => ({ url, sourceUrl }));
}

export interface NamedAudioSubSource {
    name: string;
    url: string;
}

export function namedAudioSubSources(value: unknown): NamedAudioSubSource[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const entries: NamedAudioSubSource[] = [];
    for (const list of [record.audioSources, record.sources]) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const entry = namedAudioSubSource(item);
            if (entry) entries.push(entry);
        }
    }
    return entries;
}

function namedAudioSubSource(value: unknown): NamedAudioSubSource | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as { name?: unknown; url?: unknown };
    if (typeof record.name !== 'string' || !record.name.trim()) return null;
    if (typeof record.url !== 'string' || !record.url.trim()) return null;
    return { name: record.name.trim(), url: record.url };
}

// Provider names an aggregator URL has been seen to answer with, learned from
// ordinary lookups so Settings can list them without any probe of its own.
const knownAudioSubSourcesByUrl = new Map<string, string[]>();
const audioSubSourceProbes = new Map<string, Promise<string[]>>();

function recordAudioSubSourceNames(url: string, names: string[]): string[] {
    const template = url.trim();
    if (!template) return [];
    const known = knownAudioSubSourcesByUrl.get(template) ?? [];
    const seen = new Set(known.map(audioSubSourceNameKey));
    const merged = [...known];
    for (const name of names) {
        const trimmed = name.trim();
        if (!trimmed || seen.has(audioSubSourceNameKey(trimmed))) continue;
        seen.add(audioSubSourceNameKey(trimmed));
        merged.push(trimmed);
    }
    knownAudioSubSourcesByUrl.set(template, merged);
    return [...merged];
}

export function knownAudioSubSourceNames(url: string): string[] {
    return [...(knownAudioSubSourcesByUrl.get(url.trim()) ?? [])];
}

// Sample lookups used to discover which providers an aggregator URL can answer
// with. Multiple probes because provider coverage differs per term (e.g. the
// hosted source only reveals its JapanesePod101 fallback for terms missing from
// the indexed collection).
const AUDIO_SUB_SOURCE_PROBES: ReadonlyArray<{ spelling: string; reading: string }> = [
    { spelling: '日本', reading: 'にほん' },
    { spelling: '食べる', reading: 'たべる' },
    { spelling: 'ヨム音声テスト', reading: '' },
];

/**
 * Resolves the provider names a `custom-json` URL offers, probing it with the
 * sample lookups above. Each URL is probed at most once per session; a probe
 * that never reached the endpoint is not remembered, so a later attempt (after
 * the network comes back, say) tries again instead of reporting nothing.
 */
export function detectCustomJsonAudioSubSources(url: string, timeoutMs: number, proxyUrl: string): Promise<string[]> {
    const template = url.trim();
    if (!template) return Promise.resolve([]);
    const pending = audioSubSourceProbes.get(template);
    if (pending) return pending;
    const probe = probeCustomJsonAudioSubSources(template, timeoutMs, proxyUrl).then(result => {
        if (!result.reached) audioSubSourceProbes.delete(template);
        return recordAudioSubSourceNames(template, result.names);
    }, error => {
        audioSubSourceProbes.delete(template);
        throw error;
    });
    audioSubSourceProbes.set(template, probe);
    return probe;
}

async function probeCustomJsonAudioSubSources(
    template: string,
    timeoutMs: number,
    proxyUrl: string,
): Promise<{ names: string[]; reached: boolean }> {
    const results = await Promise.allSettled(AUDIO_SUB_SOURCE_PROBES.map(async probe => {
        const sourceUrl = formatAudioUrl(withAudioQueryPlaceholders(template), probe as unknown as JPDBCard);
        const response = await requestUrl(sourceUrl, 'text', timeoutMs, { proxyUrl });
        if (typeof response !== 'string') throw new Error('Audio source returned no text.');
        return namedAudioSubSources(parseJsonValue(response));
    }));
    const seen = new Set<string>();
    const names: string[] = [];
    let reached = false;
    for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        reached = true;
        for (const entry of result.value) {
            const key = audioSubSourceNameKey(entry.name);
            if (seen.has(key)) continue;
            seen.add(key);
            names.push(audioSubSourceProviderName(entry.name));
        }
    }
    return { names, reached };
}

export function resetAudioSubSourceDiscoveryForTests(): void {
    knownAudioSubSourcesByUrl.clear();
    audioSubSourceProbes.clear();
}

function parseJsonValue(text: string): unknown {
    return parseJson<unknown>(text, null, 'candidates.parseJsonValue');
}

// The local audio server (yomidevs / Yomitan "Ultimate" source) requires
// ?term=&reading= query parameters and answers a bare URL with HTTP 400, so a
// pasted server origin (e.g. http://localhost:9090/) silently fails. Users
// routinely omit the markers because the field placeholder doesn't show them;
// append the standard pair when none are present so the bare URL just works.
function withAudioQueryPlaceholders(template: string): string {
    if (AUDIO_QUERY_PLACEHOLDER_RE.test(template)) return template;
    const [base, fragment = ''] = splitUrlFragment(template);
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}term={term}&reading={reading}${fragment}`;
}

function splitUrlFragment(value: string): [string, string] {
    const hash = value.indexOf('#');
    return hash < 0 ? [value, ''] : [value.slice(0, hash), value.slice(hash)];
}

async function loadJapanesePod101AudioCandidates(_source: AudioSourceSetting, card: JPDBCard): Promise<AudioCandidate[]> {
    const url = getJapanesePod101Url(card);
    return [{ url, sourceUrl: url }];
}

async function loadLanguagePod101AudioCandidates(_source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<AudioCandidate[]> {
    const urls = await getLanguagePod101AudioUrls(card, timeoutMs, proxyUrl);
    return urlsToAudioCandidates(urls.length ? urls : [getJapanesePod101Url(card)]);
}

function urlsToAudioCandidates(urls: string[]): AudioCandidate[] {
    return urls.map(url => ({ url, sourceUrl: url }));
}

function jpdbAudioIdsToCandidates(audioIds: string[]): AudioCandidate[] {
    return normalizeJpdbAudioIds(audioIds).map(audioId => ({
        url: jpdbAudioRequest(audioId).url,
        sourceUrl: jpdbAudioPageSourceUrl(audioId),
        jpdbAudioId: audioId,
    }));
}

function filterJpdbAudioIdsForVoice(audioIds: string[], voice: string): string[] {
    const normalized = voice.trim().toLowerCase();
    const prefixes = JPDB_TTS_VOICE_PREFIXES[normalized];
    if (prefixes) return audioIds.filter(audioId => jpdbAudioIdMatchesVoice(audioId, prefixes));
    return audioIds;
}

function jpdbAudioIdMatchesVoice(audioId: string, prefixes: string[]): boolean {
    const normalized = audioId.trim().toLowerCase();
    return prefixes.some(prefix => normalized.startsWith(`${prefix}/`)
        || (prefix.length === 1 && new RegExp(`^${escapeRegExp(prefix)}\\d+/`).test(normalized)));
}

async function jitenTtsAudioCandidates(source: AudioSourceSetting, card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<AudioCandidate[]> {
    const reference = jitenAudioReferenceFromCard(card) ?? await lookupJitenAudioReference(card, timeoutMs, proxyUrl);
    if (!reference) return [];
    const voices = jitenTtsVoicesForSource(source);
    return voices.map(voice => {
        const url = jitenWordTtsUrl(reference.wordId, reference.readingIndex, voice);
        return { url, sourceUrl: url };
    });
}

function jitenTtsVoicesForSource(source: AudioSourceSetting): string[] {
    return jitenTtsVoicesForValue(source.voice);
}

function jitenAudioReferenceFromCard(card: JPDBCard): JitenAudioReference | null {
    const wordId = finitePositiveInteger(card.jitenWordId) ?? (card.source === 'jiten' ? finitePositiveInteger(card.vid) : undefined);
    const readingIndex = finiteNonNegativeInteger(card.jitenReadingIndex) ?? (card.source === 'jiten' ? finiteNonNegativeInteger(card.sid) : undefined);
    return wordId === undefined || readingIndex === undefined ? null : { wordId, readingIndex };
}

async function lookupJitenAudioReference(card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<JitenAudioReference | null> {
    const queries = uniqueStrings([card.spelling, card.reading].map(value => value.trim()).filter(Boolean));
    for (const query of queries) {
        const url = `${JITEN_VOCABULARY_SEARCH_URL}?query=${encodeURIComponent(query)}&limit=8`;
        const response = await requestUrl(url, 'text', timeoutMs, {
            proxyUrl,
            allowDirectCrossOrigin: false,
            preferFetch: true,
        }).catch(() => '');
        if (typeof response !== 'string') continue;
        const reference = bestJitenAudioReference(card, jitenVocabularySearchResults(response));
        if (reference) return reference;
    }
    return null;
}

function jitenVocabularySearchResults(response: string): JitenAudioReferenceSearchResult[] {
    try {
        const payload = JSON.parse(response) as unknown;
        if (!payload || typeof payload !== 'object') return [];
        const results = (payload as { results?: unknown }).results;
        return Array.isArray(results) ? results.map(normalizeJitenAudioReferenceSearchResult).filter((result): result is JitenAudioReferenceSearchResult => Boolean(result)) : [];
    } catch {
        return [];
    }
}

interface JitenAudioReferenceSearchResult extends JitenAudioReference {
    text: string;
    reading: string;
}

function normalizeJitenAudioReferenceSearchResult(value: unknown): JitenAudioReferenceSearchResult | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const wordId = finitePositiveInteger(record.wordId);
    const readingIndex = finiteNonNegativeInteger(record.readingIndex);
    if (wordId === undefined || readingIndex === undefined) return null;
    return {
        wordId,
        readingIndex,
        text: typeof record.text === 'string' ? record.text.trim() : '',
        reading: cleanJitenRubyText(typeof record.rubyText === 'string' ? record.rubyText : '').trim(),
    };
}

function bestJitenAudioReference(card: JPDBCard, results: JitenAudioReferenceSearchResult[]): JitenAudioReference | null {
    if (!results.length) return null;
    const spelling = card.spelling.trim();
    const reading = card.reading.trim();
    const exact = results.find(result => result.text === spelling && (!reading || result.reading === reading));
    const spellingOnly = exact ?? results.find(result => result.text === spelling);
    const readingOnly = spellingOnly ?? results.find(result => reading && result.reading === reading);
    const match = readingOnly ?? results[0];
    return match ? { wordId: match.wordId, readingIndex: match.readingIndex } : null;
}

function cleanJitenRubyText(value: string): string {
    return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, '$2');
}

function finitePositiveInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function finiteNonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function getJapanesePod101Url(card: JPDBCard): string {
    const spelling = card.spelling.trim();
    const reading = card.reading.trim() || spelling;
    const params = new URLSearchParams();
    if (spelling && spelling !== reading) params.set('kanji', spelling);
    params.set('kana', reading);
    return `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.toString()}`;
}

export function isJapanesePod101Url(value: string): boolean {
    try {
        const url = new URL(value);
        return url.hostname === 'assets.languagepod101.com' && url.pathname.endsWith('/audiomp3.php');
    } catch {
        return false;
    }
}

async function getJpdbTtsAudioIds(card: JPDBCard, timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    for (const url of jpdbVocabularyAudioLookupUrls(card)) {
        const response = await requestUrl(url, 'text', timeoutMs, { proxyUrl, credentials: 'same-origin', withCredentials: true }).catch(() => '');
        if (typeof response !== 'string') continue;
        const audioIds = extractJpdbVocabularyAudioIds(response, card, url);
        if (audioIds.length) return audioIds;
    }
    return [];
}

function jpdbVocabularyAudioLookupUrls(card: JPDBCard): string[] {
    const urls: string[] = [];
    if (card.vid > 0) urls.push(jpdbVocabularyUrl(card.vid, card.spelling, card.reading));
    for (const query of uniqueStrings([card.spelling, card.reading].filter(Boolean))) {
        urls.push(`${JPDB_SEARCH_URL}?q=${encodeURIComponent(query)}`);
    }
    return uniqueStrings(urls);
}

function jpdbVocabularyUrl(vid: number, spelling: string, reading: string): string {
    return `${JPDB_VOCABULARY_BASE_URL}/${vid}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading || spelling)}`;
}

function extractJpdbVocabularyAudioIds(html: string, card: JPDBCard, sourceUrl = ''): string[] {
    return uniqueStrings(jpdbVocabularyAudioHtmlBlocks(html, card, sourceUrl)
        .flatMap(extractJpdbVocabularyAudioIdsFromHtml));
}

function jpdbVocabularyAudioHtmlBlocks(html: string, card: JPDBCard, sourceUrl = ''): string[] {
    const resultBlocks = findHtmlBlocksByClass(html, 'result')
        .filter(block => htmlBlockHasClass(block, 'vocabulary') && jpdbVocabularyBlockMatchesCard(block, card));
    if (resultBlocks.length) return resultBlocks;
    const singleSearchResultBlocks = findHtmlBlocksByClass(html, 'result')
        .filter(block => htmlBlockHasClass(block, 'vocabulary'));
    if (canUseSingleJpdbAliasAudioResult(singleSearchResultBlocks, card, sourceUrl)) return singleSearchResultBlocks;
    return jpdbHtmlMatchesCard(html, card) ? [html] : [];
}

function canUseSingleJpdbAliasAudioResult(resultBlocks: string[], card: JPDBCard, sourceUrl: string): boolean {
    return resultBlocks.length === 1
        && isJpdbSearchUrl(sourceUrl)
        && isJpdbAliasLookup(card, sourceUrl)
        && extractJpdbVocabularyAudioIdsFromHtml(resultBlocks[0] ?? '').length > 0;
}

function isJpdbSearchUrl(value: string): boolean {
    try {
        const url = new URL(value, 'https://jpdb.io');
        return url.hostname === 'jpdb.io' && url.pathname === '/search';
    } catch {
        return false;
    }
}

function isJpdbAliasLookup(card: JPDBCard, sourceUrl: string): boolean {
    const query = jpdbSearchQuery(sourceUrl);
    if (!query || JAPANESE_TEXT_RE.test(query)) return false;
    const normalizedQuery = cleanJpdbIdentityText(query);
    return [card.spelling, card.reading]
        .some(value => cleanJpdbIdentityText(value) === normalizedQuery);
}

function jpdbSearchQuery(value: string): string {
    return attempt(() => new URL(value, 'https://jpdb.io').searchParams.get('q')?.trim() ?? '', '', 'candidates.jpdbSearchQuery');
}

function jpdbVocabularyBlockMatchesCard(html: string, card: JPDBCard): boolean {
    return jpdbVocabularyIdentities(html).some(identity => jpdbVocabularyIdentityMatches(identity, card));
}

function jpdbHtmlMatchesCard(html: string, card: JPDBCard): boolean {
    if (jpdbVocabularyBlockMatchesCard(html, card)) return true;
    const canonical = getHtmlAttributeFromOpeningTag(html, 'link', 'href', /\brel\s*=\s*(["'])canonical\1/i);
    return canonical ? jpdbVocabularyIdentityMatches(jpdbVocabularyIdentityFromUrl(canonical), card) : false;
}

interface JpdbVocabularyIdentity {
    vid: number;
    expression: string;
    reading: string;
}

interface JpdbCardVocabularyIdentity {
    requested: Set<string>;
    reading: string;
    spelling: string;
}

function jpdbVocabularyIdentities(html: string): Array<JpdbVocabularyIdentity | null> {
    const pattern = /\bhref\s*=\s*(["'])([\s\S]*?\/vocabulary\/[\s\S]*?)\1/gi;
    const identities: Array<JpdbVocabularyIdentity | null> = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) identities.push(jpdbVocabularyIdentityFromUrl(match[2] ?? ''));
    return identities;
}

function jpdbVocabularyIdentityFromUrl(value: string): JpdbVocabularyIdentity | null {
    const identity = parseJpdbVocabularyUrlIdentity(value);
    return identity ? { vid: identity.vid, expression: identity.spelling, reading: identity.reading } : null;
}

function jpdbVocabularyIdentityMatches(identity: JpdbVocabularyIdentity | null, card: JPDBCard): boolean {
    if (!identity) return false;
    if (jpdbVocabularyVidMatches(identity, card)) return true;
    return jpdbVocabularyTextIdentityMatches(identity, jpdbCardVocabularyIdentity(card));
}

function jpdbVocabularyVidMatches(identity: JpdbVocabularyIdentity, card: JPDBCard): boolean {
    return card.vid > 0 && identity.vid === card.vid;
}

function jpdbCardVocabularyIdentity(card: JPDBCard): JpdbCardVocabularyIdentity {
    const spelling = cleanJpdbIdentityText(card.spelling);
    const reading = cleanJpdbIdentityText(card.reading);
    return {
        requested: new Set([spelling, reading].filter(Boolean)),
        reading,
        spelling,
    };
}

function jpdbVocabularyTextIdentityMatches(identity: JpdbVocabularyIdentity, card: JpdbCardVocabularyIdentity): boolean {
    if (!card.requested.size) return true;
    const expression = cleanJpdbIdentityText(identity.expression);
    const reading = cleanJpdbIdentityText(identity.reading);
    if (!jpdbVocabularyCandidateSharesRequestedText(expression, reading, card.requested)) return false;
    return jpdbVocabularyCandidateReadingMatches(expression, reading, card);
}

function jpdbVocabularyCandidateSharesRequestedText(expression: string, reading: string, requested: Set<string>): boolean {
    return requested.has(expression) || requested.has(reading);
}

function jpdbVocabularyCandidateReadingMatches(expression: string, reading: string, card: JpdbCardVocabularyIdentity): boolean {
    if (!card.reading) return true;
    return reading === card.reading
        || expression === card.reading
        || expression === card.spelling;
}

function cleanJpdbIdentityText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

function extractJpdbVocabularyAudioIdsFromHtml(html: string): string[] {
    const audioIds: string[] = [];
    const pattern = /<a\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        const attributes = match[1] ?? '';
        if (!attributesHaveClass(attributes, 'vocabulary-audio')) continue;
        audioIds.push(...normalizeJpdbAudioIds(getHtmlAttribute(attributes, 'data-audio') ?? ''));
    }
    return audioIds;
}

function htmlBlockHasClass(html: string, className: string): boolean {
    const opening = /^<[^/\s>]+\b([^>]*)>/i.exec(html)?.[1] ?? '';
    return attributesHaveClass(opening, className);
}

function getHtmlAttributeFromOpeningTag(html: string, tag: string, attribute: string, attributePattern?: RegExp): string | null {
    const pattern = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        const attributes = match[1] ?? '';
        if (attributes && (!attributePattern || attributePattern.test(attributes))) {
            return getHtmlAttribute(attributes, attribute);
        }
    }
    return null;
}

async function getJishoAudioUrls(card: JPDBCard, timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    const url = `https://jisho.org/search/${encodeURIComponent(card.spelling)}`;
    const response = shouldSkipJishoHtmlLookup(proxyUrl)
        ? ''
        : await requestUrl(url, 'text', timeoutMs, {
            proxyUrl,
            preferFetch: false,
        }).catch(() => '');

    if (typeof response === 'string' && response) {
        const audioHtml = findJishoAudioElement(response, card);
        const urls = audioHtml ? jishoAudioSourceUrls(audioHtml, url) : [];
        if (urls.length) return urls;
        return [];
    }

    return getJishoPublicFallbackAudioUrls(card, timeoutMs, proxyUrl);
}

function shouldSkipJishoHtmlLookup(proxyUrl: string): boolean {
    return !getUserscriptHttpRequest() && !hasCustomJishoHtmlProxy(proxyUrl);
}

function hasCustomJishoHtmlProxy(proxyUrl: string): boolean {
    const normalized = proxyUrl.trim();
    if (!normalized) return false;
    try {
        new URL(normalized);
        return true;
    } catch {
        return false;
    }
}

async function getJishoPublicFallbackAudioUrls(card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<string[]> {
    return getJishoTextProxyAudioUrls(card, timeoutMs, proxyUrl);
}

function jishoAudioSourceUrls(audioHtml: string, baseUrl: string): string[] {
    return extractAudioSourceUrls(audioHtml, baseUrl).filter(isLikelyAudioUrl);
}

async function getJishoTextProxyAudioUrls(card: JPDBCard, timeoutMs: number, proxyUrl: string): Promise<string[]> {
    const url = `${JISHO_TEXT_PROXY_BASE_URL}/${encodeURIComponent(card.spelling)}`;
    // Ask the reader text proxy (r.jina.ai) for the RAW jisho HTML instead of its
    // markdown rendering. jisho.org itself is unreachable from the hosted reader
    // (CORS-blocked direct; the public worker proxy fails its TLS handshake with a
    // 525), so this is the only browser-reachable path. The HTML carries the
    // <audio id="audio_{spelling}:{reading}"><source …cloudfront…> element, which
    // we parse with the same logic as the direct/userscript path (and yomitan) —
    // the markdown rendering drops/mangles that <source>, which is why jisho audio
    // silently produced no candidates on the hosted reader.
    const response = await requestUrl(url, 'text', timeoutMs, {
        proxyUrl,
        allowDirectCrossOrigin: true,
        allowPublicProxies: false,
        allowConfiguredProxy: false,
        preferFetch: true,
        headers: { 'X-Return-Format': 'html' },
    }).catch(() => '');
    if (typeof response !== 'string' || !response) return [];
    const searchUrl = `https://jisho.org/search/${encodeURIComponent(card.spelling)}`;
    const audioHtml = findJishoAudioElement(response, card);
    const fromHtml = audioHtml ? jishoAudioSourceUrls(audioHtml, searchUrl) : [];
    if (fromHtml.length) return fromHtml.slice(0, 1);
    // Fallback for a markdown-only proxy response (no audio element to parse).
    return extractJishoTextProxyAudioUrls(response, card).slice(0, 1);
}

function extractJishoTextProxyAudioUrls(markdown: string, card: JPDBCard): string[] {
    const wordsSection = markdownSection(markdown, /^#{1,6}\s+Words\b/im);
    const rawCandidates = findAudioUrls(wordsSection || markdown)
        .filter(url => {
            try {
                const target = new URL(url);
                return target.hostname === 'd1vjc5dkcd3yh2.cloudfront.net' && target.pathname.startsWith('/audio/');
            } catch {
                return false;
            }
        });
    if (!rawCandidates.length) return [];
    const context = compactJapaneseText((wordsSection || markdown).slice(0, Math.max(0, (wordsSection || markdown).indexOf(rawCandidates[0] ?? '')) + 280));
    const spelling = compactJapaneseText(card.spelling);
    const reading = compactJapaneseText(card.reading);
    if (spelling && !context.includes(spelling) && reading && !context.includes(reading)) return [];
    return uniqueAudioUrls(rawCandidates.map(normalizeJishoCloudfrontAudioUrl));
}

function normalizeJishoCloudfrontAudioUrl(url: string): string {
    return url.replace(/^http:\/\//i, 'https://');
}

function markdownSection(markdown: string, startPattern: RegExp): string {
    const start = markdown.search(startPattern);
    if (start < 0) return '';
    const rest = markdown.slice(start);
    const nextHeading = rest.slice(1).search(/^#{1,6}\s+/m);
    return nextHeading < 0 ? rest : rest.slice(0, nextHeading + 1);
}

function compactJapaneseText(value: string): string {
    return value.replace(/[^\u3040-\u30ff\u3400-\u9fffー・]/g, '');
}

function findJishoAudioElement(html: string, card: JPDBCard): string | null {
    const exact = findHtmlElementById(html, 'audio', `audio_${card.spelling}:${card.reading}`);
    if (exact) return exact;
    if (!canUseKanaJishoAudioFallback(card)) return null;
    return findUniqueJishoReadingAudioElement(html, card.reading.trim());
}

function canUseKanaJishoAudioFallback(card: JPDBCard): boolean {
    const spelling = card.spelling.trim();
    const reading = card.reading.trim();
    return Boolean(spelling && reading && KANA_ONLY_RE.test(spelling));
}

function findUniqueJishoReadingAudioElement(html: string, reading: string): string | null {
    const matches = findHtmlElements(html, 'audio')
        .filter(element => jishoAudioReading(element).trim() === reading);
    return matches.length === 1 ? matches[0] : null;
}

function jishoAudioReading(audioHtml: string): string {
    const id = htmlAttributeValue(audioHtml, 'id') ?? '';
    const marker = id.startsWith('audio_') ? id.slice('audio_'.length) : '';
    const colon = marker.lastIndexOf(':');
    return colon >= 0 ? marker.slice(colon + 1) : '';
}

async function getLanguagePod101AudioUrls(card: JPDBCard, timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    const url = 'https://www.japanesepod101.com/learningcenter/reference/dictionary_post';
    const response = await requestUrl(url, 'text', timeoutMs, { ...languagePod101RequestOptions(card), proxyUrl }).catch(() => '');
    if (typeof response !== 'string') return [];

    const urls: string[] = [];
    for (const row of findHtmlBlocksByClass(response, 'dc-result-row')) {
        if (!languagePod101RowMatchesCard(row, card)) continue;
        urls.push(...extractAudioSourceUrls(row, url));
    }
    return uniqueAudioUrls(urls);
}

function languagePod101RequestOptions(card: JPDBCard): AudioRequestOptions {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: languagePod101RequestBody(card),
    };
}

function languagePod101RequestBody(card: JPDBCard): string {
    const searchQuery = card.spelling.trim() || card.reading;
    return new URLSearchParams({
        post: 'dictionary_reference',
        match_type: 'exact',
        search_query: searchQuery,
        vulgar: 'true',
    }).toString();
}

function languagePod101RowMatchesCard(row: string, card: JPDBCard): boolean {
    return card.reading === card.spelling || languagePod101RowKana(row) === card.reading;
}

function languagePod101RowKana(row: string): string {
    const kanaHtml = findHtmlElementByClass(row, 'span', 'dc-vocab_kana');
    return stripHtml(kanaHtml ?? '').trim();
}

async function getCommonsAudioUrls(term: string, source: 'lingua-libre' | 'wiktionary', timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    const apiUrl = commonsSearchApiUrl(term, source);
    const response = await requestUrl(apiUrl, 'text', timeoutMs, { proxyUrl });
    if (typeof response !== 'string') return [];

    const urls: string[] = [];
    for (const title of commonsSearchTitles(response)) {
        urls.push(...await getCommonsAudioUrlsForTitle(title, term, source, timeoutMs, proxyUrl));
    }
    return urls;
}

function commonsSearchApiUrl(term: string, source: 'lingua-libre' | 'wiktionary'): string {
    const search = source === 'lingua-libre'
        ? `intitle:/-(${escapeRegExp(term)}).wav/i incategory:"Lingua_Libre_pronunciation-jpn"`
        : `intitle:/ja(-[a-zA-Z]{2})?-${escapeRegExp(term)}[0123456789]*.ogg/i`;
    return `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&origin=*&srsearch=${encodeURIComponent(search)}`;
}

function commonsSearchTitles(response: string): string[] {
    const pages = (JSON.parse(response) as { query?: { search?: Array<{ title?: string }> } }).query?.search ?? [];
    return pages.slice(0, 6).map(page => page.title).filter((title): title is string => Boolean(title));
}

async function getCommonsAudioUrlsForTitle(title: string, term: string, source: 'lingua-libre' | 'wiktionary', timeoutMs: number, proxyUrl = ''): Promise<string[]> {
    const info = await requestUrl(commonsImageInfoUrl(title), 'text', timeoutMs, { proxyUrl }).catch(() => null);
    if (typeof info !== 'string') return [];
    return commonsImageInfoUrls(info, title, term, source);
}

function commonsImageInfoUrl(title: string): string {
    return `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&origin=*&titles=${encodeURIComponent(title)}`;
}

function commonsImageInfoUrls(info: string, title: string, term: string, source: 'lingua-libre' | 'wiktionary'): string[] {
    const filePages = (JSON.parse(info) as { query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string; user?: string }> }> } }).query?.pages ?? {};
    return Object.values(filePages)
        .map(filePage => filePage.imageinfo?.[0])
        .filter(image => Boolean(image?.url && isValidCommonsAudioFilename(title, image.user ?? '', term, source)))
        .map(image => image?.url ?? '');
}

function findHtmlElementById(html: string, tag: string, id: string): string | null {
    return findHtmlElement(html, tag, new RegExp(`\\bid\\s*=\\s*(["'])${escapeRegExp(id)}\\1`, 'i'));
}

function htmlAttributeValue(html: string, attribute: string): string | null {
    const match = new RegExp(`\\b${escapeRegExp(attribute)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(html);
    return match?.[2] ?? null;
}

function findHtmlElementByClass(html: string, tag: string, className: string): string | null {
    return findHtmlElementsByClass(html, tag, className)[0] ?? null;
}

function findHtmlElementsByClass(html: string, tag: string, className: string): string[] {
    return findHtmlElements(html, tag).filter(element => htmlElementHasClass(element, tag, className));
}

function findHtmlBlocksByClass(html: string, className: string): string[] {
    const starts: number[] = [];
    const startPattern = /<[^/!][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = startPattern.exec(html))) {
        if (tagAttributesHaveClass(match[0], className)) starts.push(match.index);
    }
    return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function findHtmlElement(html: string, tag: string, attributePattern?: RegExp): string | null {
    return findHtmlElements(html, tag, attributePattern)[0] ?? null;
}

function findHtmlElements(html: string, tag: string, attributePattern?: RegExp): string[] {
    const pattern = new RegExp(`<${tag}\\b([^>]*)>[\\s\\S]*?<\\/${tag}>`, 'gi');
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        if (htmlElementMatchesAttributes(match, attributePattern)) matches.push(match[0]);
    }
    return matches;
}

function htmlElementMatchesAttributes(match: RegExpExecArray, attributePattern?: RegExp): boolean {
    const attributes = match[1] ?? '';
    return attributePattern ? attributePattern.test(attributes) : true;
}

function htmlElementHasClass(element: string, tag: string, className: string): boolean {
    const opening = new RegExp(`^<${tag}\\b([^>]*)>`, 'i').exec(element)?.[1] ?? '';
    return attributesHaveClass(opening, className);
}

function tagAttributesHaveClass(openingTag: string, className: string): boolean {
    const attributes = /^<[^/\s>]+\b([^>]*)>/i.exec(openingTag)?.[1] ?? '';
    return attributesHaveClass(attributes, className);
}

function attributesHaveClass(attributes: string, className: string): boolean {
    return (getHtmlAttribute(attributes, 'class') ?? '').split(/\s+/).includes(className);
}

function extractAudioSourceUrls(html: string, baseUrl: string): string[] {
    const urls: string[] = [];
    const sourcePattern = /<source\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = sourcePattern.exec(html))) {
        const src = getHtmlAttribute(match[1] ?? '', 'src');
        const url = src ? resolveAudioSourceUrl(src, baseUrl) : '';
        if (url) urls.push(url);
    }
    return uniqueAudioUrls(urls);
}

function resolveAudioSourceUrl(src: string, baseUrl: string): string {
    return attempt(() => new URL(src, baseUrl).href, '', 'candidates.resolveAudioSourceUrl');
}

function getHtmlAttribute(attributes: string, name: string): string | null {
    const match = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(attributes);
    return match ? decodeHtmlAttribute(match[2]) : null;
}

function decodeHtmlAttribute(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value: string): string {
    return decodeHtmlAttribute(value.replace(/<[^>]+>/g, ''));
}

function isValidCommonsAudioFilename(filename: string | undefined, fileUser: string, term: string, source: 'lingua-libre' | 'wiktionary'): boolean {
    if (!filename) return false;
    if (source === 'lingua-libre') {
        return new RegExp(`^File:LL-Q\\d+\\s+\\(jpn\\)-${escapeRegExp(fileUser)}-${escapeRegExp(term)}\\.wav$`, 'i').test(filename);
    }
    return new RegExp(`^File:ja(-\\w\\w)?-${escapeRegExp(term)}\\d*\\.ogg$`, 'i').test(filename);
}

function normalizeAudioUrl(value: string, sourceUrl?: string): string {
    try {
        const nested = new URL(value);
        if (sourceUrl) alignLoopbackAudioUrl(nested, new URL(sourceUrl));
        return normalizeAudioUrlSlashes(nested.href);
    } catch {
        return normalizeAudioUrlSlashes(value);
    }
}

function alignLoopbackAudioUrl(nested: URL, source: URL): void {
    if (!shouldAlignLoopbackAudioUrl(nested, source)) return;
    nested.protocol = source.protocol;
    nested.hostname = source.hostname;
}

function shouldAlignLoopbackAudioUrl(nested: URL, source: URL): boolean {
    return isLoopbackAudioHost(nested.hostname)
        && !isLoopbackAudioHost(source.hostname)
        && nested.port === source.port;
}

function isLoopbackAudioHost(hostname: string): boolean {
    return LOOPBACK_AUDIO_HOSTS.has(hostname);
}

function normalizeAudioUrlSlashes(value: string): string {
    return value.replace(/\\/g, '/');
}

function isLikelyAudioRecord(record: Record<string, unknown>): boolean {
    return typeof record.url === 'string' && audioRecordHasPlayableSignal(record);
}

function audioRecordHasPlayableSignal(record: Record<string, unknown>): boolean {
    return isLikelyAudioUrl(String(record.url))
        || ['audio', 'audioSource'].includes(String(record.type ?? ''))
        || typeof record.name === 'string';
}

function isLikelyAudioUrl(value: string): boolean {
    if (value.startsWith('data:audio/')) return true;
    if (isJapanesePod101Url(value)) return true;
    try {
        const url = new URL(value, location.href);
        const pathname = url.pathname.toLowerCase();
        return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/.test(pathname)
            || /(^|[-_/])(audio|sound|voice|pronunciation)([-_/]|$)/i.test(pathname);
    } catch {
        return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)(?:$|[?#])/i.test(value);
    }
}

function uniqueAudioUrls(urls: string[]): string[] {
    const seen = new Set<string>();
    return urls.filter(url => {
        const key = normalizeAttemptedAudioUrl(url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function shouldFetchCandidateAsBlob(candidate: AudioCandidate, audioViaBlob: boolean): boolean {
    if (!canFetchAudioCandidateAsBlob(candidate, audioViaBlob)) return false;
    return isBlobFetchableAudioCandidate(candidate);
}

function canFetchAudioCandidateAsBlob(candidate: AudioCandidate, audioViaBlob: boolean): boolean {
    return audioViaBlob
        && !candidate.url.startsWith('blob:')
        && !candidate.url.startsWith('data:audio/')
        && !isLoopbackAudioUrl(candidate.url);
}

function isBlobFetchableAudioCandidate(candidate: AudioCandidate): boolean {
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(candidate.url)) return false;
    return /^https?:\/\//i.test(candidate.url)
        || isAppleTouchBrowser()
        || isJapanesePod101Url(candidate.url)
        || isJapanesePod101Url(candidate.sourceUrl);
}

function isLoopbackAudioUrl(value: string): boolean {
    try {
        const base = typeof location === 'undefined' ? undefined : location.href;
        return isLoopbackAudioHost(new URL(value, base).hostname);
    } catch {
        return false;
    }
}

export function preconnectAudioUrl(value: string): void {
    const origin = audioPreconnectOrigin(value);
    if (!origin || preconnectedAudioOrigins.has(origin)) return;
    preconnectedAudioOrigins.add(origin);
    appendAudioPreconnectLinks(origin);
}

function audioPreconnectOrigin(value: string): string | null {
    return attempt(() => new URL(value, location.href).origin, null, 'candidates.audioPreconnectOrigin');
}

function appendAudioPreconnectLinks(origin: string): void {
    for (const rel of AUDIO_PRECONNECT_RELS) appendAudioPreconnectLink(origin, rel);
}

function appendAudioPreconnectLink(origin: string, rel: (typeof AUDIO_PRECONNECT_RELS)[number]): void {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = origin;
    if (rel === 'preconnect') link.crossOrigin = 'anonymous';
    document.head?.append(link);
}

