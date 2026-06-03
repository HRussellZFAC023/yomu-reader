import { afterEach, beforeEach } from 'vitest';
import { applyPreferredJapaneseSiteLanguage } from '../../src/reader/preferred-site-language';

const TEST_LANGUAGE = 'en-US';
const TEST_LANGUAGES = ['en-US', 'en'] as const;
const PREFERRED_SITE_LANGUAGE_CACHE_KEY = 'yomu:prefer-japanese-site-language';

function resetPreferredSiteLanguage(): void {
    applyPreferredJapaneseSiteLanguage(false);
    try {
        localStorage.removeItem(PREFERRED_SITE_LANGUAGE_CACHE_KEY);
    } catch {
        // jsdom storage may be unavailable in a few isolated setup failures.
    }
}

function setDefaultNavigatorLanguage(): void {
    const navigatorObject = globalThis.navigator;
    if (!navigatorObject) return;
    defineNavigatorLanguage(navigatorObject);
    defineNavigatorLanguage(Object.getPrototypeOf(navigatorObject));
}

function defineNavigatorLanguage(target: object | null): void {
    if (!target) return;
    Object.defineProperty(target, 'language', {
        configurable: true,
        get: () => TEST_LANGUAGE,
    });
    Object.defineProperty(target, 'languages', {
        configurable: true,
        get: () => TEST_LANGUAGES.slice(),
    });
}

function resetLocaleState(): void {
    resetPreferredSiteLanguage();
    setDefaultNavigatorLanguage();
}

beforeEach(resetLocaleState);
afterEach(resetLocaleState);
