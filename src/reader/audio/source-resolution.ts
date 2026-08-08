import { ShuffledAudioDeck } from './playback-queue';
import { YOMU_HOSTED_AUDIO_URL } from '../app/constants';
import { activeLearningTarget } from '../languages/target-runtime';
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

const YOMU_HOSTED_AUDIO_SOURCE: AudioSourceSetting =
    { type: 'custom-json', url: YOMU_HOSTED_AUDIO_URL, voice: '', enabled: true };
const TARGET_SPEECH_SYNTHESIS_SOURCE: AudioSourceSetting =
    { type: 'text-to-speech', url: '', voice: '', enabled: true };

export function getOrderedAudioSources(settings: ReaderSettings): AudioSourceSetting[] {
    const sources = settings.audioSources.filter(source => source.enabled);
    if (!settings.audioEnableDefaultSources) return sources;

    return defaultAudioSources(settings.audioSources, sources);
}

function defaultAudioSources(
    authoredSources: readonly AudioSourceSetting[],
    enabledSources: readonly AudioSourceSetting[],
): AudioSourceSetting[] {
    const target = activeLearningTarget();
    const configured = enabledSources.filter(source => !isYomuHostedAudioSource(source));
    return [
        ...hostedDefaultAudioSources(authoredSources, target.audio.recordedWordAudio),
        ...configured,
        ...targetSpeechSynthesisSources(configured, target.experiences.audio),
    ];
}

function hostedDefaultAudioSources(
    authoredSources: readonly AudioSourceSetting[],
    recordedWordAudio: boolean,
): AudioSourceSetting[] {
    if (!recordedWordAudio) return [];
    const hosted = authoredSources.find(isYomuHostedAudioSource) ?? YOMU_HOSTED_AUDIO_SOURCE;
    return hosted.enabled ? [{ ...hosted }] : [];
}

function targetSpeechSynthesisSources(
    configured: readonly AudioSourceSetting[],
    experience: string,
): AudioSourceSetting[] {
    if (experience !== 'speech-synthesis') return [];
    if (configured.some(isBrowserTextToSpeechSource)) return [];
    return [TARGET_SPEECH_SYNTHESIS_SOURCE];
}

function isYomuHostedAudioSource(source: AudioSourceSetting): boolean {
    return source.type === 'custom-json'
        && source.url.trim() === YOMU_HOSTED_AUDIO_URL;
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
        case 'bunpro':
            return true;
        case 'jiten-tts':
            return hasJitenAudioReference(card);
        default:
            return false;
    }
}

export function hasJitenAudioReference(card: JPDBCard): boolean {
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

/**
 * Returns the configured sources in their authored priority order. The order of
 * the source list IS the user's priority; only the individual clips/voices a
 * single source offers are shuffled (see {@link orderAudioCandidates}) when
 * "Shuffle audio" is selected. Reshuffling the source list itself would make the
 * Media → Audio sources list feel ignored, so it is intentionally preserved here.
 */
export function orderAudioSources(
    sources: AudioSourceSetting[],
    card: JPDBCard,
): OrderedAudioSource[] {
    return audioSourceDeckEntries(sources, getAudioSourceBagKey(sources, card));
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

/**
 * The provider an aggregator clip came from.
 *
 * Aggregators label each clip, not each source: the hosted source answers 日本
 * with `nhk16 ニホ＼ん [2]`, `daijisen にほ＼ん [2]`, `forvo_jp akitomo`, `jpod`.
 * The reading, pitch, and speaker differ per word, so only the leading token is
 * stable enough to tick once and have it mean the same thing tomorrow.
 */
export function audioSubSourceProviderName(name: string): string {
    const trimmed = name.trim().normalize('NFC');
    return trimmed.split(/\s+/, 1)[0] ?? trimmed;
}

export function audioSubSourceNameKey(name: string): string {
    return audioSubSourceProviderName(name).toLowerCase();
}

export function disabledAudioSubSourceNameKeys(source: AudioSourceSetting): Set<string> {
    return new Set((source.subSources ?? [])
        .filter(subSource => !subSource.enabled)
        .map(subSource => audioSubSourceNameKey(subSource.name)));
}

function audioSubSourceFilterKey(source: AudioSourceSetting): string {
    return [...disabledAudioSubSourceNameKeys(source)].sort().join('\u0002');
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
        audioSubSourceFilterKey(source),
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
        audioSubSourceFilterKey(source),
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
        audioSubSourceFilterKey(source),
    ].join('\u0000');
}
