import { ShuffledAudioDeck } from './playback-queue';
import type { AudioSelectionMode, AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from '../app/types';

export interface AudioCandidate {
    url: string;
    sourceUrl: string;
    jpdbAudioId?: string;
}

export interface AudioPreloadOptions {
    sourceLimit?: number;
    candidateLimit?: number;
    prepareAudio?: boolean;
}

export interface AudioPreloadLimits {
    sourceLimit: number;
    candidateLimit: number;
    prepareAudio: boolean;
}

export interface OrderedAudioSource {
    source: AudioSourceSetting;
    id: string;
    bagKey: string;
    signature: string;
}

export interface AudioSourceDeckState {
    exhausted: boolean;
    lastPlayed?: string;
    lastPlayedSignature?: string;
}

const REQUIRED_JA_AUDIO_SOURCES: AudioSourceType[] = ['jpod101', 'language-pod-101', 'jisho', 'jiten-tts', 'jpdb-tts', 'text-to-speech'];

export function getOrderedAudioSources(settings: ReaderSettings): AudioSourceSetting[] {
    const sources = settings.audioSources.filter(source => source.enabled);
    if (!settings.audioEnableDefaultSources) return sources;

    const configuredTypes = new Set(settings.audioSources.map(source => source.type));
    return [
        ...sources,
        ...REQUIRED_JA_AUDIO_SOURCES
            .filter(type => !configuredTypes.has(type))
            .map(type => ({ type, url: '', voice: '', enabled: true })),
    ];
}

export function preloadableAudioSources(sources: AudioSourceSetting[], settings: ReaderSettings): AudioSourceSetting[] {
    return settings.audioTtsMode === 'source-order'
        ? sources.filter(source => !isBrowserTextToSpeechSource(source))
        : sources.filter(source => !isTextToSpeechFallbackSource(source));
}

export function cheapCandidatePreloadAudioSources(sources: AudioSourceSetting[], card: JPDBCard): AudioSourceSetting[] {
    return sources.filter(source => canResolveAudioCandidatesWithoutNetwork(source, card));
}

function canResolveAudioCandidatesWithoutNetwork(source: AudioSourceSetting, card: JPDBCard): boolean {
    switch (source.type) {
        case 'custom':
        case 'jpod101':
            return true;
        case 'jiten-tts':
            return hasJitenAudioReference(card);
        default:
            return false;
    }
}

function hasJitenAudioReference(card: JPDBCard): boolean {
    return isPositiveFiniteInteger(card.jitenWordId) && isFiniteNonNegativeInteger(card.jitenReadingIndex)
        || card.source === 'jiten' && isPositiveFiniteInteger(card.vid) && isFiniteNonNegativeInteger(card.sid);
}

function isPositiveFiniteInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function audioPreloadLimits(options: AudioPreloadOptions): AudioPreloadLimits {
    return {
        sourceLimit: Math.max(1, options.sourceLimit ?? 1),
        candidateLimit: Math.max(1, options.candidateLimit ?? 1),
        prepareAudio: options.prepareAudio !== false,
    };
}

export function orderAudioCandidates(
    candidates: AudioCandidate[],
    mode: AudioSelectionMode,
    bagKey: string,
    shuffledAudio: ShuffledAudioDeck,
): Array<{ candidate: AudioCandidate; id: string }> {
    return orderAudioDeckEntries(candidates.map((candidate, index) => ({
        candidate,
        id: audioCandidateDeckId(candidate, index),
    })), mode, bagKey, shuffledAudio);
}

export function audioCandidateSelectionMode(sourceType: AudioSourceType, mode: AudioSelectionMode): AudioSelectionMode {
    return sourceType === 'jpdb-tts' || sourceType === 'jiten-tts' ? 'random' : mode;
}

export function orderAudioSources(
    sources: AudioSourceSetting[],
    mode: AudioSelectionMode,
    card: JPDBCard,
    shuffledAudio: ShuffledAudioDeck,
    options: { avoidFirstSignature?: string } = {},
): OrderedAudioSource[] {
    const bagKey = getAudioSourceBagKey(sources, card);
    const ordered = orderAudioDeckEntries(audioSourceDeckEntries(sources, bagKey), mode, bagKey, shuffledAudio);
    rotateAvoidedAudioSourceLead(ordered, options.avoidFirstSignature);
    return ordered;
}

export function audioSourceDeckState(
    sources: AudioSourceSetting[],
    card: JPDBCard,
    shuffledAudio: ShuffledAudioDeck,
): AudioSourceDeckState {
    const bagKey = getAudioSourceBagKey(sources, card);
    const entries = audioSourceDeckEntries(sources, bagKey);
    const ids = entries.map(source => source.id);
    const lastPlayed = shuffledAudio.lastPlayed(bagKey, ids);
    return {
        exhausted: shuffledAudio.isExhausted(bagKey, ids),
        lastPlayed,
        lastPlayedSignature: entries.find(entry => entry.id === lastPlayed)?.signature,
    };
}

function audioSourceDeckEntries(sources: AudioSourceSetting[], bagKey: string): OrderedAudioSource[] {
    return sources.map((source, index) => {
        const signature = getAudioSourceSignature(source);
        return {
            source,
            id: getAudioSourceDeckId(signature, index),
            bagKey,
            signature,
        };
    });
}

export function isBrowserTextToSpeechSource(source: AudioSourceSetting): boolean {
    return source.type === 'text-to-speech' || source.type === 'text-to-speech-reading';
}

export function isApiTextToSpeechSource(source: AudioSourceSetting): boolean {
    return source.type === 'jiten-tts' || source.type === 'jpdb-tts';
}

export function isTextToSpeechFallbackSource(source: AudioSourceSetting): boolean {
    return isApiTextToSpeechSource(source) || isBrowserTextToSpeechSource(source);
}

export function registerAudioAttempt(triedUrls: Set<string>, candidate: AudioCandidate): boolean {
    const candidateKey = normalizeAttemptedAudioUrl(candidate.url);
    if (triedUrls.has(candidateKey)) return false;
    triedUrls.add(candidateKey);
    return true;
}

export function getAudioBagKey(source: AudioSourceSetting, card: JPDBCard): string {
    return [
        source.type,
        source.url,
        source.voice,
        card.spelling,
        card.reading,
    ].join('\u0001');
}

export function getJpdbAudioBagKey(audioIds: string[]): string {
    return [
        'jpdb-audio',
        ...[...audioIds].sort(),
    ].join('\u0001');
}

export function getAudioCandidateCacheKey(source: AudioSourceSetting, card: JPDBCard): string {
    return [
        source.type,
        source.url.trim(),
        source.voice.trim(),
        card.spelling,
        card.reading,
    ].join('\u0001');
}

export function preparedAudioCacheKey(candidate: AudioCandidate, mode: AudioSelectionMode, audioViaBlob: boolean): string {
    return [
        normalizeAttemptedAudioUrl(candidate.url),
        normalizeAttemptedAudioUrl(candidate.sourceUrl),
        mode,
        audioViaBlob ? 'blob' : 'direct',
    ].join('\u0001');
}

export function cloneAudioCandidates(candidates: AudioCandidate[]): AudioCandidate[] {
    return candidates.map(candidate => ({ ...candidate }));
}

export function normalizeAttemptedAudioUrl(value: string): string {
    try {
        const url = new URL(value, location.href);
        url.hash = '';
        return url.href;
    } catch {
        return value;
    }
}

function audioCandidateDeckId(candidate: AudioCandidate, index: number): string {
    if (candidate.jpdbAudioId) return `jpdb:${candidate.jpdbAudioId}`;
    return [
        normalizeAttemptedAudioUrl(candidate.url),
        normalizeAttemptedAudioUrl(candidate.sourceUrl),
        index,
    ].join('\u0000');
}

function orderAudioDeckEntries<T extends { id: string }>(
    entries: T[],
    mode: AudioSelectionMode,
    bagKey: string,
    shuffledAudio: ShuffledAudioDeck,
): T[] {
    if (mode !== 'random' || !entries.length) return entries;

    const byId = new Map(entries.map(entry => [entry.id, entry]));
    const ordered: T[] = [];
    for (const id of shuffledAudio.order(bagKey, entries.map(entry => entry.id))) {
        const entry = byId.get(id);
        if (entry) ordered.push(entry);
    }
    return ordered;
}

function rotateAvoidedAudioSourceLead(sources: OrderedAudioSource[], avoidFirstSignature: string | undefined): void {
    if (avoidFirstSignature && sources.length > 1 && sources[0]?.signature === avoidFirstSignature) sources.push(sources.shift()!);
}

function getAudioSourceBagKey(sources: AudioSourceSetting[], card: JPDBCard): string {
    return [
        'audio-sources',
        card.spelling,
        card.reading,
        ...sources.map(getAudioSourceSignature),
    ].join('\u0001');
}

function getAudioSourceDeckId(signature: string, index: number): string {
    return `${index}\u0000${signature}`;
}

function getAudioSourceSignature(source: AudioSourceSetting): string {
    return [
        source.type,
        source.url.trim(),
        source.voice.trim(),
    ].join('\u0000');
}
