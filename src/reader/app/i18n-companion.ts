import { yomuI18nCompanion } from '../companions/registry';
import type { AudioSourceType, InterfaceLanguage } from './types';
import type * as I18nImpl from './i18n';

type UiLanguage = ReturnType<typeof I18nImpl.resolveUiLanguage>;

export type UiCopyKey = I18nImpl.UiCopyKey;
export interface GrammarRuleCopy extends I18nImpl.GrammarRuleCopy {}

export const CARD_STATE_LABEL_KEYS: typeof I18nImpl.CARD_STATE_LABEL_KEYS = {
    new: 'stateNew',
    learning: 'stateLearning',
    young: 'stateYoung',
    mature: 'stateMature',
    known: 'stateKnown',
    mastered: 'stateMastered',
    due: 'stateDue',
    failed: 'stateFailed',
    locked: 'stateLocked',
    'never-forget': 'stateNeverForget',
    blacklisted: 'stateBlacklisted',
    suspended: 'stateSuspended',
    'in-deck': 'stateInDeck',
    'not-in-deck': 'stateNotInDeck',
    redundant: 'stateRedundant',
    frequent: 'stateFrequent',
    unparsed: 'stateUnparsed',
};

export function resolveUiLanguage(language: InterfaceLanguage): UiLanguage {
    return yomuI18nCompanion()?.resolveUiLanguage(language) ?? fallbackResolveUiLanguage(language);
}

export function nextExplicitUiLanguage(language: InterfaceLanguage): Exclude<InterfaceLanguage, 'auto'> {
    return yomuI18nCompanion()?.nextExplicitUiLanguage(language) ?? (resolveUiLanguage(language) === 'ja' ? 'en' : 'ja');
}

export async function grammarRuleText(language: InterfaceLanguage, ruleId: string): Promise<GrammarRuleCopy | undefined> {
    return await (yomuI18nCompanion()?.grammarRuleText(language, ruleId) ?? Promise.resolve(undefined));
}

export function uiText(language: InterfaceLanguage, key: UiCopyKey): string {
    return yomuI18nCompanion()?.uiText(language, key) ?? fallbackUiText(key);
}

export function cardStateLabel(state: string, language: InterfaceLanguage, fallback = state): string {
    return yomuI18nCompanion()?.cardStateLabel(state, language, fallback) ?? fallbackCardStateLabel(state, fallback);
}

export function audioSourceLabel(language: InterfaceLanguage, type: AudioSourceType): string {
    return yomuI18nCompanion()?.audioSourceLabel(language, type) ?? fallbackAudioSourceLabel(type);
}

export function formatUiText(language: InterfaceLanguage, key: UiCopyKey, values: Record<string, string | number>): string {
    return yomuI18nCompanion()?.formatUiText(language, key, values) ?? formatTemplate(fallbackUiText(key), values);
}

export function uiList(language: InterfaceLanguage, parts: string[]): string {
    return yomuI18nCompanion()?.uiList(language, parts)
        ?? new Intl.ListFormat(resolveUiLanguage(language), { style: 'short', type: 'conjunction' }).format(parts);
}

function fallbackResolveUiLanguage(language: InterfaceLanguage): UiLanguage {
    if (language === 'ja' || language === 'en') return language;
    const languages = typeof navigator === 'undefined'
        ? []
        : [
            ...(Array.isArray(navigator.languages) ? navigator.languages : []),
            navigator.language,
        ];
    return languages.some(value => typeof value === 'string' && value.toLowerCase().startsWith('ja')) ? 'ja' : 'en';
}

function fallbackCardStateLabel(state: string, fallback: string): string {
    return CARD_STATE_LABEL_KEYS[state] ? fallbackUiText(CARD_STATE_LABEL_KEYS[state]) : fallback;
}

function fallbackAudioSourceLabel(type: AudioSourceType): string {
    return AUDIO_SOURCE_FALLBACK_LABELS[type] ?? type;
}

function fallbackUiText(key: UiCopyKey): string {
    return String(key);
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
    );
}

const AUDIO_SOURCE_FALLBACK_LABELS: Record<AudioSourceType, string> = {
    jpod101: 'JapanesePod101',
    'language-pod-101': 'LanguagePod101',
    jisho: 'Jisho',
    'lingua-libre': 'Lingua Libre',
    wiktionary: 'Wiktionary',
    'jiten-tts': 'Jiten TTS',
    'jpdb-tts': 'JPDB TTS',
    'text-to-speech': 'Text to speech',
    'text-to-speech-reading': 'Text to speech reading',
    custom: 'Custom',
    'custom-json': 'Custom JSON',
};
