import type { ReaderSettings } from '../app/types';
import { activeLearningTarget } from '../languages/active';
import { canonicalLanguageTag, languageSubtag, localeDirection } from '../languages/locale';
import { OUTPUT_LANGUAGE } from '../languages/selection';
import type { TextDirection } from '../languages/types';
import type { SubtitleTrackMetadata } from './subtitle-track-metadata';
import { subtitleTrackLanguage } from './subtitle-track-metadata';

export interface SubtitleLanguageSelection {
    targetLanguage: string;
    outputLanguage: string;
}

export interface SubtitleContentLanguage {
    lang: string;
    dir: TextDirection;
}

export interface SubtitleLanguageContext extends SubtitleLanguageSelection {
    targetContent: SubtitleContentLanguage;
    outputContent: SubtitleContentLanguage;
    preferredTranslationLanguages: readonly string[];
}

/** Resolve TARGET and OUTPUT once for one subtitle render/discovery transaction. */
export function resolveSubtitleLanguageContext(_settings?: ReaderSettings): SubtitleLanguageContext {
    const target = activeLearningTarget();
    const targetContent = contentLanguage(target.typography.contentLocale, target.subtitles.languageTag);
    const output = OUTPUT_LANGUAGE;
    const outputContent = contentLanguage(output, output);
    return {
        targetLanguage: target.subtitles.languageTag,
        outputLanguage: languageSubtag(output) ?? output,
        targetContent,
        outputContent,
        preferredTranslationLanguages: uniqueLanguages([
            target.subtitles.languageTag,
            languageSubtag(output) ?? output,
        ]),
    };
}

export function sameSubtitleLanguageContext(left: SubtitleLanguageContext, right: SubtitleLanguageContext): boolean {
    return subtitleLanguageContextKey(left) === subtitleLanguageContextKey(right);
}

export function subtitleLanguageContextKey(context: SubtitleLanguageContext): string {
    return [
        context.targetLanguage,
        context.outputLanguage,
        context.targetContent.lang,
        context.outputContent.lang,
    ].join(':');
}

export function subtitleContentLanguage(
    track: SubtitleTrackMetadata | undefined,
    fallback: SubtitleContentLanguage,
): SubtitleContentLanguage {
    const language = subtitleTrackLanguage(track);
    return language ? contentLanguage(language, language) : fallback;
}

export function subtitleContentAttributes(content: SubtitleContentLanguage): string {
    return `lang="${content.lang}" dir="${content.dir}"`;
}

export function syncSubtitleContentLanguage(element: HTMLElement, content: SubtitleContentLanguage): void {
    if (element.lang !== content.lang) element.lang = content.lang;
    if (element.dir !== content.dir) element.dir = content.dir;
}

function contentLanguage(locale: string, fallback: string): SubtitleContentLanguage {
    const lang = canonicalLanguageTag(locale) ?? canonicalLanguageTag(fallback) ?? fallback;
    return { lang, dir: localeDirection(lang) };
}

function uniqueLanguages(languages: readonly string[]): readonly string[] {
    return [...new Set(languages.map(language => language.trim().toLowerCase()).filter(Boolean))];
}
