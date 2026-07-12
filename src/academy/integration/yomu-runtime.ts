/**
 * Boots the already-built hosted Reader on Academy pages. This keeps Japanese
 * annotations, pitch colouring, and tap-to-dictionary on the canonical Reader
 * implementation without bundling a second copy into Academy.
 */

const RUNTIME_MARKER_ID = 'jpdb-reader-runtime-owner';
const CORE_SCRIPT_ID = 'yomu-hosted-academy-runtime';
const CSS_ATTRIBUTE = 'data-yomu-hosted-academy-css';
const SCRIPT_ATTRIBUTE = 'data-yomu-hosted-academy-script';
const COMPANION_ATTRIBUTE = 'data-yomu-hosted-academy-settings';
const SETTINGS_COMPANION = 'greasyfork/yomu-settings-surface.user.js';
const JAPANESE_SURFACE_SELECTOR = '[lang="ja"], [data-yomu-runtime-surface]';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const RUNTIME_READY_TIMEOUT_MS = 6_000;
const SURFACE_WAIT_TIMEOUT_MS = 15_000;

let bootPromise: Promise<boolean> | null = null;

export function initYomuReaderRuntime(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
    bootPromise ??= bootWhenJapaneseAppears().catch(() => false);
    return bootPromise;
}

export function academyRuntimeAssetCandidates(fileName: string, href = window.location.href): string[] {
    const current = new URL(href);
    const urls = [
        new URL(`../${fileName}`, current),
        new URL(`./${fileName}`, current),
        new URL(`/${fileName}`, current.origin),
        new URL(`/yomu-reader/${fileName}`, current.origin),
    ];
    return [...new Set(urls.map(url => url.href))];
}

async function bootWhenJapaneseAppears(): Promise<boolean> {
    if (hasYomuRuntime()) return true;
    await waitForJapaneseSurface();
    if (hasYomuRuntime()) return true;
    seedAcademyReaderDefaults();
    await loadStylesheet();
    await loadSettingsCompanion();
    const loaded = await loadCoreRuntime();
    return loaded && waitForRuntimeReady();
}

function hasYomuRuntime(): boolean {
    const runtimeWindow = window as Window & { __yomuReaderAppInitialized?: boolean };
    return Boolean(runtimeWindow.__yomuReaderAppInitialized || document.getElementById(RUNTIME_MARKER_ID));
}

function waitForJapaneseSurface(): Promise<void> {
    if (document.querySelector(JAPANESE_SURFACE_SELECTOR)) return Promise.resolve();
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            observer?.disconnect();
            window.clearTimeout(timer);
            resolve();
        };
        const observer = typeof MutationObserver === 'undefined'
            ? undefined
            : new MutationObserver(() => {
                if (document.querySelector(JAPANESE_SURFACE_SELECTOR)) finish();
            });
        observer?.observe(document.documentElement, { childList: true, subtree: true });
        const timer = window.setTimeout(finish, SURFACE_WAIT_TIMEOUT_MS);
    });
}

function seedAcademyReaderDefaults(): void {
    try {
        if (localStorage.getItem(SETTINGS_KEY) !== null) return;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            showFurigana: true,
            furiganaMode: 'all',
            showPitchAccent: true,
        }));
    } catch {
        // Reader defaults remain usable when storage is unavailable.
    }
}

function loadStylesheet(): Promise<boolean> {
    if (document.querySelector(`link[${CSS_ATTRIBUTE}], link[href$="/yomu.css"], link[href*="/yomu.css?"]`)) {
        return Promise.resolve(true);
    }
    return loadLinkChain(academyRuntimeAssetCandidates('yomu.css'));
}

function loadCoreRuntime(): Promise<boolean> {
    if (hasYomuRuntime()) return Promise.resolve(true);
    if (document.getElementById(CORE_SCRIPT_ID) || document.querySelector(`script[${SCRIPT_ATTRIBUTE}]`)) {
        return waitForRuntimeReady();
    }
    return loadScriptChain(academyRuntimeAssetCandidates('yomu.user.js'));
}

function loadSettingsCompanion(): Promise<boolean> {
    if (document.querySelector(`script[${COMPANION_ATTRIBUTE}]`)) return Promise.resolve(true);
    return loadPlainScriptChain(academyRuntimeAssetCandidates(SETTINGS_COMPANION));
}

function loadPlainScriptChain(candidates: readonly string[], index = 0): Promise<boolean> {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.async = false;
        script.src = candidates[index];
        script.setAttribute(COMPANION_ATTRIBUTE, 'true');
        script.addEventListener('load', () => resolve(true), { once: true });
        script.addEventListener('error', () => {
            script.remove();
            void loadPlainScriptChain(candidates, index + 1).then(resolve);
        }, { once: true });
        (document.head ?? document.documentElement).append(script);
    });
}

function loadScriptChain(candidates: readonly string[], index = 0): Promise<boolean> {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.id = CORE_SCRIPT_ID;
        script.async = false;
        script.src = candidates[index];
        script.setAttribute(SCRIPT_ATTRIBUTE, 'true');
        const tryNext = () => {
            script.remove();
            void loadScriptChain(candidates, index + 1).then(resolve);
        };
        script.addEventListener('load', () => {
            void waitForRuntimeReady().then(ready => ready ? resolve(true) : tryNext());
        }, { once: true });
        script.addEventListener('error', tryNext, { once: true });
        (document.head ?? document.documentElement).append(script);
    });
}

function loadLinkChain(candidates: readonly string[], index = 0): Promise<boolean> {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise(resolve => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = candidates[index];
        link.setAttribute(CSS_ATTRIBUTE, 'true');
        link.addEventListener('load', () => resolve(true), { once: true });
        link.addEventListener('error', () => {
            link.remove();
            void loadLinkChain(candidates, index + 1).then(resolve);
        }, { once: true });
        (document.head ?? document.documentElement).append(link);
    });
}

function waitForRuntimeReady(timeoutMs = RUNTIME_READY_TIMEOUT_MS): Promise<boolean> {
    if (hasYomuRuntime()) return Promise.resolve(true);
    return new Promise(resolve => {
        const startedAt = performance.now();
        const check = () => {
            if (hasYomuRuntime()) return resolve(true);
            if (performance.now() - startedAt >= timeoutMs) return resolve(false);
            window.setTimeout(check, 60);
        };
        check();
    });
}
