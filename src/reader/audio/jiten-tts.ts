import type { ReaderSettings } from '../app/types';

const JITEN_TTS_API_BASE_URL = 'https://api.jiten.moe/api/tts';
const JITEN_TTS_RANDOM_VOICES = ['female', 'female2', 'male', 'male2', 'asmr'] as const;

export function jitenTtsVoicesForValue(value: string | undefined): string[] {
    const voice = value?.trim();
    return voice ? [voice] : [...JITEN_TTS_RANDOM_VOICES];
}

function preferredJitenTtsVoice(settings: ReaderSettings): string {
    return settings.audioSources.find(source =>
        source.enabled
        && source.type === 'jiten-tts'
        && source.voice.trim()
    )?.voice.trim() ?? '';
}

export function jitenTtsVoicesForSettings(settings: ReaderSettings): string[] {
    return jitenTtsVoicesForValue(preferredJitenTtsVoice(settings));
}

export function jitenWordTtsUrl(wordId: number, readingIndex: number, voice: string): string {
    return `${JITEN_TTS_API_BASE_URL}/word/${wordId}/${readingIndex}?voice=${encodeURIComponent(voice)}`;
}

export function jitenSentenceTtsUrl(sentenceId: number, voice: string): string {
    return `${JITEN_TTS_API_BASE_URL}/sentence/${sentenceId}?voice=${encodeURIComponent(voice)}`;
}
