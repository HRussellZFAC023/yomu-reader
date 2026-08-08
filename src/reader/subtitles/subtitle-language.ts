import { languageDisplayName, languageSubtag } from '../languages/locale';
import {
    LEARNING_TARGET_ROSTER,
    learningTargetRosterIdForTag,
    type LearningTargetRosterId,
} from '../languages/roster';

interface SubtitleLanguageDescriptor {
    readonly id: LearningTargetRosterId;
    readonly tag: string;
    readonly exactAliases: readonly string[];
    readonly nameHints: readonly string[];
}

// Compatibility spellings that are useful subtitle metadata but are not
// language tags and therefore cannot be recovered through Intl. Everything
// else comes from the frozen learning-target roster or Intl's ISO aliases.
const SUBTITLE_COMPATIBILITY_ALIASES: Readonly<Partial<Record<LearningTargetRosterId, readonly string[]>>> = Object.freeze({
    ja: Object.freeze(['jp', 'nihongo', 'nihon-go', '日文', '日語', '日本字幕']),
    en: Object.freeze(['英文']),
});

const SUBTITLE_LANGUAGE_DESCRIPTORS: readonly SubtitleLanguageDescriptor[] = Object.freeze(
    LEARNING_TARGET_ROSTER.map(target => {
        const tag = languageSubtag(target.runtimeLocale) ?? target.runtimeLocale;
        const compatibilityAliases = SUBTITLE_COMPATIBILITY_ALIASES[target.id] ?? [];
        const nativeNameWithoutQualifier = target.nativeName.replace(/\s*[（(][^）)]*[）)]\s*/gu, '').trim();
        return Object.freeze({
            id: target.id,
            tag,
            exactAliases: uniqueAliases([
                target.id,
                target.runtimeLocale,
                tag,
                target.englishName,
                target.nativeName,
                nativeNameWithoutQualifier,
                ...compatibilityAliases,
            ]),
            nameHints: uniqueAliases([
                target.englishName,
                target.nativeName,
                nativeNameWithoutQualifier,
                languageDisplayName(tag, 'ja'),
                ...compatibilityAliases.filter(alias => alias.length > 3 || /[^\x00-\x7f]/u.test(alias)),
            ]),
        });
    }),
);

const SUBTITLE_LANGUAGE_BY_ID = new Map(
    SUBTITLE_LANGUAGE_DESCRIPTORS.map(descriptor => [descriptor.id, descriptor] as const),
);
const SUBTITLE_LANGUAGE_BY_EXACT_ALIAS = new Map<string, string>();
for (const descriptor of SUBTITLE_LANGUAGE_DESCRIPTORS) {
    for (const alias of descriptor.exactAliases) {
        SUBTITLE_LANGUAGE_BY_EXACT_ALIAS.set(foldSubtitleLanguageText(alias), descriptor.tag);
    }
}
const SUBTITLE_LANGUAGE_NAME_HINTS = SUBTITLE_LANGUAGE_DESCRIPTORS
    .flatMap(descriptor => descriptor.nameHints.map(alias => {
        const folded = foldSubtitleLanguageText(alias);
        return { alias: folded, tag: descriptor.tag, pattern: subtitleLanguageNamePattern(folded) };
    }))
    .filter(hint => hint.alias)
    .sort((a, b) => b.alias.length - a.alias.length);
const SUBTITLE_LANGUAGE_TAGS = new Set(SUBTITLE_LANGUAGE_DESCRIPTORS.map(descriptor => descriptor.tag));

/**
 * Infer a roster language from a visible track label or subtitle URL.
 *
 * Names come from the 33-target roster, while ISO-639 aliases are normalized
 * by Intl. Code-like label fragments require subtitle context or filename
 * punctuation so ordinary two-letter words such as "it" and "la" do not turn
 * arbitrary video titles into language declarations.
 */
export function inferSubtitleLanguage(label: string, url = ''): string | undefined {
    const named = inferNamedSubtitleLanguage(label) ?? inferNamedSubtitleLanguage(subtitleUrlHintText(url));
    if (named) return named;

    const coded = inferSubtitleLanguageCode(label, hasSubtitleMarker(label))
        ?? inferSubtitleLanguageCode(subtitleUrlHintText(url), true);
    if (coded) return coded;

    // Kana is unambiguously Japanese. Han alone is not: treating every Han
    // title as Japanese made Chinese and Cantonese tracks impossible to infer.
    return /[\u3040-\u30ff]/u.test(label) ? 'ja' : undefined;
}

/**
 * Fold a language tag, ISO alias, or roster language name to the short tag
 * owned by its learning-target Module. Unknown values retain their previous
 * pass-through behaviour.
 */
export function normalizeSubtitleLanguage(language: string | undefined): string | undefined {
    if (!language) return undefined;
    const exact = SUBTITLE_LANGUAGE_BY_EXACT_ALIAS.get(foldSubtitleLanguageText(language));
    if (exact) return exact;

    const rosterId = learningTargetRosterIdForTag(language);
    return rosterId ? SUBTITLE_LANGUAGE_BY_ID.get(rosterId)?.tag : language;
}

/** Whether a label is only a language/generic caption marker, not a title. */
export function isGenericSubtitleLabel(value: string): boolean {
    const cleaned = value.trim();
    return /^(?:vtt|srt|ass|ssa|subtitles?|captions?|cc|closed captions?)$/iu.test(cleaned)
        || SUBTITLE_LANGUAGE_BY_EXACT_ALIAS.has(foldSubtitleLanguageText(cleaned));
}

function inferNamedSubtitleLanguage(value: string): string | undefined {
    const text = foldSubtitleLanguageText(decodeSubtitleLanguageText(value));
    if (!text) return undefined;
    const candidates = SUBTITLE_LANGUAGE_NAME_HINTS.flatMap(hint => languageNameMatches(text, hint.pattern)
        .map(index => ({
            tag: hint.tag,
            score: subtitleLanguageCueScore(text, index, index + hint.alias.length),
            index,
            length: hint.alias.length,
        })));
    return candidates.sort((left, right) => right.score - left.score
        || left.index - right.index
        || right.length - left.length)[0]?.tag;
}

function subtitleLanguageNamePattern(alias: string): RegExp {
    const value = escapeRegExp(alias);
    return /[^\x00-\x7f]/u.test(alias)
        ? new RegExp(`(${value})`, 'gu')
        : new RegExp(`(?:^|[^\\p{Script=Latin}\\p{Number}])(${value})(?![\\p{Script=Latin}\\p{Number}])`, 'gu');
}

function languageNameMatches(text: string, pattern: RegExp): number[] {
    return [...text.matchAll(pattern)].map(match => match.index + match[0].length - (match[1]?.length ?? 0));
}

function subtitleLanguageCueScore(text: string, start: number, end: number): number {
    if (isWholeSubtitleLabelMatch(text, start, end)) return 120;
    const before = text.slice(Math.max(0, start - 28), start);
    const after = text.slice(end, Math.min(text.length, end + 28));
    return contextualSubtitleLanguageScore(before, after);
}

function isWholeSubtitleLabelMatch(text: string, start: number, end: number): boolean {
    return start === 0 && end === text.length;
}

function contextualSubtitleLanguageScore(before: string, after: string): number {
    if (hasSubtitleDeclarationCue(before, after)) return 100;
    if (hasContentDescriptionCue(before, after)) return -40;
    return 10;
}

function hasSubtitleDeclarationCue(before: string, after: string): boolean {
    return /^\s*(?:[-–—:()[\]]*\s*)?(?:subtitles?|captions?|closed[ -]captions?|cc|language|lang)\b/iu.test(after)
        || /\b(?:subtitles?|captions?|closed[ -]captions?|cc|language|lang)\s*(?:[-–—:()[\]]*\s*)?$/iu.test(before);
}

function hasContentDescriptionCue(before: string, after: string): boolean {
    return /\b(?:for|learn|learning|lesson|course|movie|film|drama|show|video|anime)\s*$/iu.test(before)
        || /^\s*(?:movie|film|drama|show|video|anime|lesson|course)\b/iu.test(after);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferSubtitleLanguageCode(value: string, allowWhitespaceDelimited: boolean): string | undefined {
    const text = decodeSubtitleLanguageText(value);
    for (const match of text.matchAll(/[a-z]{2,3}/giu)) {
        const token = match[0];
        const start = match.index;
        const end = start + token.length;
        if (isLatinLetterOrNumber(text[start - 1] ?? '') || isLatinLetterOrNumber(text[end] ?? '')) continue;
        if (!allowWhitespaceDelimited && !hasStructuredCodeBoundary(text, start, end)) continue;
        const normalized = normalizeSubtitleLanguage(token);
        if (normalized && SUBTITLE_LANGUAGE_TAGS.has(normalized)) return normalized;
    }
    return undefined;
}

function hasStructuredCodeBoundary(text: string, start: number, end: number): boolean {
    const before = text[start - 1] ?? '';
    const after = text[end] ?? '';
    return /[._/()[\]{}-]/u.test(before) || /[._/()[\]{}-]/u.test(after)
        || (start === 0 && end === text.length);
}

function hasSubtitleMarker(value: string): boolean {
    return /\b(?:subtitles?|captions?|closed[ -]captions?|cc|language|lang)\b/iu.test(value);
}

function subtitleUrlHintText(value: string): string {
    if (!value) return '';
    try {
        const parsed = new URL(value, document.baseURI);
        return decodeSubtitleLanguageText([
            parsed.pathname,
            ...parsed.searchParams.values(),
        ].join(' '));
    } catch {
        return decodeSubtitleLanguageText(value);
    }
}

function decodeSubtitleLanguageText(value: string): string {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
        return value;
    }
}

function foldSubtitleLanguageText(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/\p{Mark}/gu, '')
        .trim()
        .toLocaleLowerCase()
        .replace(/_/g, '-');
}

function isLatinLetterOrNumber(value: string): boolean {
    return Boolean(value && /[\p{Script=Latin}\p{Number}]/u.test(value));
}

function uniqueAliases(values: readonly string[]): readonly string[] {
    return Object.freeze([...new Set(values.filter(Boolean))]);
}
