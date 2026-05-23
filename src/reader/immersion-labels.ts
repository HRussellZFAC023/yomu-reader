import { resolveUiLanguage, uiText } from './i18n';
import type { ImmersionKitExample } from './immersion-kit';
import type { InterfaceLanguage } from './types';

const IMMERSION_SOURCE_TITLES_JA: Record<string, string> = {
    'My Neighbor Totoro': 'となりのトトロ',
};

export function localizedImmersionProviderLabel(example: ImmersionKitExample, language: InterfaceLanguage): string {
    return example.provider === 'nadeshiko' ? 'Nadeshiko' : uiText(language, 'immersionKit');
}

export function localizedImmersionSourceTitle(title: string, language: InterfaceLanguage): string {
    return resolveUiLanguage(language) === 'ja' ? IMMERSION_SOURCE_TITLES_JA[title] ?? title : title;
}
