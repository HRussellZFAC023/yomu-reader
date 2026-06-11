// ADR-0003: tests exercise core + companions together, like the
// self-contained build; populate the companion registry up front.
import '../../src/reader/companions/register-build-companions';
import { afterEach, beforeEach, vi } from 'vitest';
import { applyPreferredJapaneseSiteLanguage } from '../../src/reader/app/preferred-site-language';

const TEST_LANGUAGE = 'en-US';
const TEST_LANGUAGES = ['en-US', 'en'] as const;
const PREFERRED_SITE_LANGUAGE_CACHE_KEY = 'yomu:prefer-japanese-site-language';
let mediaMethodRestorers: Array<() => void> = [];

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

function stubJsdomMediaElementMethods(): void {
    if (typeof HTMLMediaElement === 'undefined') return;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    mediaMethodRestorers = [
        () => playSpy.mockRestore(),
        () => pauseSpy.mockRestore(),
        () => loadSpy.mockRestore(),
    ];
}

function restoreJsdomMediaElementMethods(): void {
    for (const restore of mediaMethodRestorers) restore();
    mediaMethodRestorers = [];
}

beforeEach(() => {
    resetLocaleState();
    stubJsdomMediaElementMethods();
});

afterEach(() => {
    resetLocaleState();
    restoreJsdomMediaElementMethods();
    // Stop a test that left fake timers (or stubbed globals) on from leaking into
    // the next one, which otherwise surfaces as flaky failures in unrelated tests.
    vi.useRealTimers();
});
