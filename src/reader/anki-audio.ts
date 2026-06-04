import {
    assertPlayableAudioBlob,
    blobToDataUrl,
    decodeJpdbAudioBlob,
    findAudioUrl,
    getAudioCandidates,
    isJapanesePod101Url,
    isJsonAudioResponse,
    jpdbAudioRequest,
} from './audio';
import {
    getAudioBagKey,
    getOrderedAudioSources,
    isBrowserTextToSpeechSource,
    orderAudioCandidates,
    orderAudioSources,
    registerAudioAttempt,
    type AudioCandidate,
} from './audio-source-resolution';
import { ShuffledAudioDeck } from './audio-playback-queue';
import { requestAudioUrl } from './audio-request';
import { uiText } from './i18n';
import type { AudioSourceSetting, AudioSourceType, JPDBCard, ReaderSettings } from './types';

export interface AnkiWordAudioMedia {
    dataUrl?: string;
    url?: string;
}

export async function resolveAnkiWordAudio(card: JPDBCard, settings: ReaderSettings): Promise<AnkiWordAudioMedia | null> {
    if (!settings.audioEnabled) return null;
    const sources = orderAudioSources(
        getOrderedAudioSources(settings).filter(source => !isBrowserTextToSpeechSource(source)),
        settings.audioSelectionMode,
        card,
        new ShuffledAudioDeck(),
    );
    const triedUrls = new Set<string>();
    for (const { source } of sources) {
        const audio = await resolveAnkiWordAudioFromSource(source, card, settings, triedUrls).catch(() => null);
        if (audio) return audio;
    }
    return null;
}

async function resolveAnkiWordAudioFromSource(
    source: AudioSourceSetting,
    card: JPDBCard,
    settings: ReaderSettings,
    triedUrls: Set<string>,
): Promise<AnkiWordAudioMedia | null> {
    const candidates = await getAudioCandidates(source, card, settings.audioTimeoutMs, settings.corsProxyUrl);
    const bagKey = getAudioBagKey(source, card);
    const shuffled = new ShuffledAudioDeck();
    for (const { candidate } of orderAudioCandidates(candidates, settings.audioSelectionMode, bagKey, shuffled)) {
        if (!registerAudioAttempt(triedUrls, candidate)) continue;
        const audio = await ankiAudioMediaFromCandidate(candidate, source.type, settings).catch(() => null);
        if (audio) return audio;
    }
    return null;
}

async function ankiAudioMediaFromCandidate(candidate: AudioCandidate, sourceType: AudioSourceType, settings: ReaderSettings): Promise<AnkiWordAudioMedia | null> {
    if (candidate.url.startsWith('data:audio/')) return { dataUrl: candidate.url };
    if (candidate.jpdbAudioId) return { dataUrl: await jpdbAudioDataUrl(candidate.jpdbAudioId, settings) };
    try {
        const dataUrl = await fetchAudioDataUrl(candidate.url, candidate.sourceUrl, settings.audioTimeoutMs, settings.audioSelectionMode, settings.corsProxyUrl, settings.interfaceLanguage);
        if (dataUrl) return { dataUrl };
    } catch (error) {
        if (!canUseAnkiRemoteAudioFallback(candidate, sourceType, error)) return null;
    }
    return /^https?:\/\//i.test(candidate.url) ? { url: candidate.url } : null;
}

function canUseAnkiRemoteAudioFallback(candidate: AudioCandidate, sourceType: AudioSourceType, error: unknown): boolean {
    if (!/^https?:\/\//i.test(candidate.url)) return false;
    if (sourceType === 'jpod101' || isJapanesePod101Url(candidate.url) || isJapanesePod101Url(candidate.sourceUrl)) return false;
    const message = error instanceof Error ? error.message : String(error);
    if (/instead of audio|no audio|failed \(\d{3}\)/i.test(message)) return false;
    return true;
}

async function jpdbAudioDataUrl(audioId: string, settings: ReaderSettings): Promise<string> {
    const request = jpdbAudioRequest(audioId, settings.interfaceLanguage);
    const response = await requestAudioUrl(request.url, 'blob', settings.audioTimeoutMs, {
        headers: request.headers,
        proxyUrl: settings.corsProxyUrl,
        language: settings.interfaceLanguage,
        credentials: 'same-origin',
        withCredentials: true,
    });
    if (!(response instanceof Blob)) throw new Error(uiText(settings.interfaceLanguage, 'jpdbAudioPlayableFileMissing'));
    return blobToDataUrl(await decodeJpdbAudioBlob(response, request.encoded, settings.interfaceLanguage), settings.interfaceLanguage);
}

async function fetchAudioDataUrl(url: string, sourceUrl: string, timeoutMs: number, mode: ReaderSettings['audioSelectionMode'], proxyUrl: string, language: ReaderSettings['interfaceLanguage']): Promise<string> {
    const response = await requestAudioUrl(url, 'blob', timeoutMs, { proxyUrl, language });
    if (isJsonAudioResponse(response)) {
        const nestedUrl = findAudioUrl(JSON.parse(await response.text()), sourceUrl, mode);
        if (!nestedUrl) throw new Error(uiText(language, 'audioJsonMissingPlayableUrl'));
        return fetchAudioDataUrl(nestedUrl, sourceUrl, timeoutMs, mode, proxyUrl, language);
    }
    if (!(response instanceof Blob)) throw new Error(uiText(language, 'audioSourceReturnedNoAudio'));
    await assertPlayableAudioBlob(response, url, sourceUrl, language);
    return blobToDataUrl(response, language);
}
