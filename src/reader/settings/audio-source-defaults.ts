import { YOMU_HOSTED_AUDIO_URL } from '../app/constants';
import type { AudioSourceSetting, AudioSourceType } from '../app/types';

export const DEFAULT_AUDIO_URL = YOMU_HOSTED_AUDIO_URL;

const AUDIO_SOURCE_TYPE_VALUES: AudioSourceType[] = [
    'jpod101',
    'language-pod-101',
    'jisho',
    'bunpro',
    'lingua-libre',
    'wiktionary',
    'jiten-tts',
    'jpdb-tts',
    'text-to-speech',
    'text-to-speech-reading',
    'custom',
    'custom-json',
];

export const AUDIO_SOURCE_UI_TYPE_VALUES = AUDIO_SOURCE_TYPE_VALUES.filter(type => type !== 'custom');

export const DEFAULT_AUDIO_SOURCES: AudioSourceSetting[] = [
    { type: 'custom-json', url: YOMU_HOSTED_AUDIO_URL, voice: '', enabled: true },
    { type: 'jpod101', url: '', voice: '', enabled: false },
    { type: 'language-pod-101', url: '', voice: '', enabled: false },
    { type: 'jisho', url: '', voice: '', enabled: false },
    { type: 'bunpro', url: '', voice: '', enabled: false },
    { type: 'jiten-tts', url: '', voice: '', enabled: false },
    { type: 'jpdb-tts', url: '', voice: '', enabled: false },
    { type: 'text-to-speech', url: '', voice: '', enabled: false },
];

const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(AUDIO_SOURCE_TYPE_VALUES);

export const LEGACY_DEFAULT_AUDIO_SOURCES_WITHOUT_API_TTS: AudioSourceSetting[] = [
    { type: 'custom-json', url: YOMU_HOSTED_AUDIO_URL, voice: '', enabled: true },
    { type: 'jpod101', url: '', voice: '', enabled: true },
    { type: 'language-pod-101', url: '', voice: '', enabled: true },
    { type: 'jisho', url: '', voice: '', enabled: true },
    { type: 'text-to-speech', url: '', voice: '', enabled: true },
];

export const LEGACY_DEFAULT_AUDIO_SOURCES_WITH_API_TTS: AudioSourceSetting[] = [
    { type: 'custom-json', url: YOMU_HOSTED_AUDIO_URL, voice: '', enabled: true },
    { type: 'jpod101', url: '', voice: '', enabled: true },
    { type: 'language-pod-101', url: '', voice: '', enabled: true },
    { type: 'jisho', url: '', voice: '', enabled: true },
    { type: 'jiten-tts', url: '', voice: '', enabled: true },
    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
    { type: 'text-to-speech', url: '', voice: '', enabled: true },
];

export const DEFAULT_OFF_AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(
    DEFAULT_AUDIO_SOURCES
        .filter(source => source.type !== 'custom-json' || source.url !== YOMU_HOSTED_AUDIO_URL)
        .map(source => source.type),
);

export function isAudioSourceType(value: unknown): value is AudioSourceType {
    return typeof value === 'string' && AUDIO_SOURCE_TYPES.has(value as AudioSourceType);
}
