const OFFICIAL_DICTIONARY_LANGUAGE_BY_NAME: Readonly<Record<string, string>> = Object.freeze({
    dutch: 'nl',
    english: 'en',
    french: 'fr',
    german: 'de',
    hungarian: 'hu',
    portuguese: 'pt',
    russian: 'ru',
    spanish: 'es',
    swedish: 'sv',
});

/**
 * Infers the language of a local dictionary's definitions from the same
 * identity/title evidence used by both Settings and the runtime translator.
 * `auto` is intentionally conservative: an unknown dictionary must not be
 * labelled English in Settings while being sent as Japanese at runtime.
 */
export function dictionaryDefinitionLanguage(dictionary: string): string {
    const normalized = dictionary.normalize('NFKC');
    const pair = normalized.match(/\[(?:JA|JP)-([A-Z]{2,3})(?:\s|\])/u);
    if (pair?.[1]) return dictionaryLanguageCode(pair[1]);
    const officialTitle = normalized.match(/\b(?:JMdict|JMnedict|KANJIDIC(?:2)?)\s*\(([A-Z]{2,3}(?:-[A-Z]{2,4})?)\)/iu);
    if (officialTitle?.[1]) return dictionaryLanguageCode(officialTitle[1]);
    const officialArchive = normalized.match(/\b(?:JMdict|KANJIDIC(?:2)?)[_ -](dutch|english|french|german|hungarian|portuguese|russian|spanish|swedish)(?:\.zip)?$/iu);
    if (officialArchive?.[1]) return OFFICIAL_DICTIONARY_LANGUAGE_BY_NAME[officialArchive[1].toLowerCase()] ?? 'auto';
    if (/\b(?:jitendex|jmnedict(?:\.zip)?|dojg|new saitou)\b/iu.test(normalized)
        || /新和英|斎藤和英/u.test(normalized)) return 'en';
    if (/\bJapanese-Mongolian\b/iu.test(normalized)) return 'mn';
    if (/\bJapanese-German\b/iu.test(normalized)) return 'de';
    if (/\bJapanese-Portuguese\b/iu.test(normalized)) return 'pt';
    if (/\bFrench-Japanese\b/iu.test(normalized)) return 'fr';
    if (/\bEnglish\b/iu.test(normalized)) return 'en';
    return 'auto';
}

function dictionaryLanguageCode(value: string): string {
    const code = value.toLowerCase();
    if (code === 'jp') return 'ja';
    if (code === 'cn') return 'zh';
    return code;
}
