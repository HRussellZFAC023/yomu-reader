import { pruneOldestCacheEntries } from '../core/cache-utils';
import { Logger } from '../app/logger';
import { requestJson } from '../network/http';

const DEFAULT_TIMEOUT_MS = 8000;
const TRANSLATION_CACHE_LIMIT = 320;
const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

const log = Logger.scope('GoogleTranslation');
const translationCache = new Map<string, string>();
const translationInFlight = new Map<string, Promise<string>>();

interface GoogleTranslateResponse {
    sentences?: Array<{ trans?: string }>;
}

export interface TranslateTextOptions {
    sourceLanguage: string;
    targetLanguage: string;
    timeoutMs?: number;
    includeDictionaryData?: boolean;
}

export interface GoogleTranslationLanguageCapability {
    logicalLanguage: string;
    providerLanguage: string | null;
    supported: boolean;
}

export function resetGoogleTranslationCacheForTests(): void {
    translationCache.clear();
    translationInFlight.clear();
}

export function normalizeTranslationLanguage(language: string, options: { allowAuto?: boolean } = {}): string {
    const trimmed = language.trim();
    if (options.allowAuto && trimmed.toLowerCase() === 'auto') return 'auto';
    if (!trimmed) throw new Error('Translation language is required.');
    try {
        return Intl.getCanonicalLocales(trimmed)[0] ?? trimmed;
    } catch {
        throw new Error(`Invalid translation language: ${language}`);
    }
}

/**
 * Product language identities stay canonical and provider-neutral. This
 * adapter contains the few transport-specific differences instead of leaking
 * Google language codes into profiles, DOM `lang`, or cache keys.
 */
export function googleTranslationLanguageCapability(language: string): GoogleTranslationLanguageCapability {
    const logicalLanguage = normalizeTranslationLanguage(language);
    const locale = new Intl.Locale(logicalLanguage);
    if (locale.language === 'grc') {
        return {
            logicalLanguage,
            providerLanguage: null,
            supported: false,
        };
    }
    if (locale.language === 'sr' && (locale.script === 'Latn' || logicalLanguage === 'sr')) {
        return {
            logicalLanguage,
            // Google ignores sr-Latn and returns Cyrillic. Bosnian is the
            // closest supported Serbo-Croatian standard with guaranteed Latin
            // output; the logical profile remains sr-Latn everywhere else.
            providerLanguage: 'bs',
            supported: true,
        };
    }
    return {
        logicalLanguage,
        providerLanguage: logicalLanguage,
        supported: true,
    };
}

export function googleTranslationUrl(text: string, options: TranslateTextOptions): string {
    const sourceLanguage = normalizeTranslationLanguage(options.sourceLanguage, { allowAuto: true });
    const sourceProviderLanguage = sourceLanguage === 'auto'
        ? 'auto'
        : requiredGoogleTranslationLanguage(sourceLanguage);
    const targetLanguage = requiredGoogleTranslationLanguage(options.targetLanguage);
    const params = new URLSearchParams({
        client: 'gtx',
        sl: sourceProviderLanguage,
        tl: targetLanguage,
        dt: 't',
        dj: '1',
        q: text,
    });
    if (options.includeDictionaryData) params.append('dt', 'bd');
    return `${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`;
}

export async function translateText(text: string, options: TranslateTextOptions): Promise<string> {
    const original = text.trim();
    if (!original) return '';
    const sourceLanguage = normalizeTranslationLanguage(options.sourceLanguage, { allowAuto: true });
    const targetLanguage = normalizeTranslationLanguage(options.targetLanguage);
    if (sourceLanguage !== 'auto' && sourceLanguage.toLowerCase() === targetLanguage.toLowerCase()) return original;

    const cacheKey = `${sourceLanguage}:${targetLanguage}:${original}`;
    const cached = translationCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const active = translationInFlight.get(cacheKey);
    if (active) return active;

    const request = performTranslation(original, {
        ...options,
        sourceLanguage,
        targetLanguage,
    });
    translationInFlight.set(cacheKey, request);
    void request.finally(() => {
        if (translationInFlight.get(cacheKey) === request) translationInFlight.delete(cacheKey);
    }).catch(() => undefined);
    return request;
}

function requiredGoogleTranslationLanguage(language: string): string {
    const capability = googleTranslationLanguageCapability(language);
    if (!capability.supported || !capability.providerLanguage) {
        throw new Error(`Automatic translation is not available for ${capability.logicalLanguage}.`);
    }
    return capability.providerLanguage;
}

async function performTranslation(text: string, options: TranslateTextOptions): Promise<string> {
    const url = googleTranslationUrl(text, options);
    const done = log.time('Translate text', {
        sourceLanguage: options.sourceLanguage,
        targetLanguage: options.targetLanguage,
        textLength: text.length,
    });
    try {
        const json = await requestJson(url, {
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            allowDirectCrossOrigin: true,
            allowConfiguredProxy: false,
            allowPublicProxies: false,
            preferFetch: true,
            failureLabel: 'Translation request',
            timeoutLabel: 'Translation timed out.',
        }) as GoogleTranslateResponse;
        const translated = (json.sentences ?? []).map(item => item.trans ?? '').join('').trim();
        if (!translated) throw new Error('No translation returned.');
        translationCache.set(`${options.sourceLanguage}:${options.targetLanguage}:${text}`, translated);
        pruneOldestCacheEntries(translationCache, TRANSLATION_CACHE_LIMIT);
        return translated;
    } finally {
        done();
    }
}
