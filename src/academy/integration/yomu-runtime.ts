/**
 * Boots the already-built hosted Reader on Academy pages. This keeps Japanese
 * annotations, pitch colouring, and tap-to-dictionary on the canonical Reader
 * implementation without bundling a second copy into Academy.
 */

import {
    readReaderRuntimeHealth,
    readerRuntimeConforms,
    READER_RUNTIME_MARKER_ID,
} from '../../reader/app/runtime-health';
import {
    AUTHORED_VOCABULARY_ATTRIBUTE,
    encodeAuthoredVocabularyAnnotations,
} from '../../reader/lookup/authored-vocabulary';
import { academyAuthoredVocabularyForText } from './authored-reader-vocabulary';
import { ACADEMY_READER_COMPANIONS } from './yomu-runtime-companions';

const RUNTIME_MARKER_ID = READER_RUNTIME_MARKER_ID;
const CORE_SCRIPT_ID = 'yomu-hosted-academy-runtime';
const CSS_ATTRIBUTE = 'data-yomu-hosted-academy-css';
const SCRIPT_ATTRIBUTE = 'data-yomu-hosted-academy-script';
const COMPANION_ATTRIBUTE = 'data-yomu-hosted-academy-settings';
const JAPANESE_SURFACE_SELECTOR = '[lang="ja"], [lang^="ja-"], [data-yomu-runtime-surface]';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const RUNTIME_READY_TIMEOUT_MS = 6_000;
const SURFACE_WAIT_TIMEOUT_MS = 15_000;
const ACADEMY_ROOT_ID = 'yomu-academy';
const READER_OWNED_SURFACE_QUERY = [
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
    '.jpdb-reader-text-mirror',
    '.jpdb-reader-control-text-mirror',
    '.jpdb-reader-furi',
    '.jpdb-ocr-furi',
].join(',');
const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/u;

let bootPromise: Promise<boolean> | null = null;
let annotationLifecycle: { readonly root: HTMLElement; readonly dispose: () => void } | null = null;

export function initYomuReaderRuntime(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
    ensureAcademyAnnotationLifecycle();
    bootPromise ??= bootWhenJapaneseAppears().catch(() => false);
    return bootPromise;
}

/**
 * Keeps Academy-authored Japanese on the Reader's explicit full-reading path.
 *
 * Academy swaps whole route views. The Reader observes those mutations and
 * schedules its scan, while this earlier, lightweight observer stamps the new
 * Japanese surfaces before that delayed scan collects targets. Explicit
 * surface-ignore markers still win, and Reader-owned annotation DOM is never
 * re-ingested.
 */
export function observeAcademyAnnotationSurfaces(root: HTMLElement): { dispose(): void } {
    refreshAcademyAnnotationSurfaces(root);
    if (typeof MutationObserver === 'undefined') return { dispose() {} };
    const observer = new MutationObserver(() => refreshAcademyAnnotationSurfaces(root));
    observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['lang', 'data-yomu-runtime-surface'],
    });
    return { dispose: () => observer.disconnect() };
}

export function refreshAcademyAnnotationSurfaces(root: ParentNode): number {
    const candidates = root instanceof HTMLElement && root.matches(JAPANESE_SURFACE_SELECTOR)
        ? [root, ...Array.from(root.querySelectorAll<HTMLElement>(JAPANESE_SURFACE_SELECTOR))]
        : Array.from(root.querySelectorAll<HTMLElement>(JAPANESE_SURFACE_SELECTOR));
    let marked = 0;
    for (const element of candidates) {
        if (!isAcademyJapaneseSurface(element)) continue;
        let changed = false;
        if (element.dataset.yomuRuntimeSurface === undefined) {
            element.dataset.yomuRuntimeSurface = 'academy-copy';
            changed = true;
        }
        if (element.dataset.yomuFuriganaMode !== 'all') {
            element.dataset.yomuFuriganaMode = 'all';
            changed = true;
        }
        const annotations = academyAuthoredVocabularyForText(element.textContent ?? '');
        const encodedAnnotations = annotations.length ? encodeAuthoredVocabularyAnnotations(annotations) : '';
        if (encodedAnnotations && element.getAttribute(AUTHORED_VOCABULARY_ATTRIBUTE) !== encodedAnnotations) {
            element.setAttribute(AUTHORED_VOCABULARY_ATTRIBUTE, encodedAnnotations);
            changed = true;
        } else if (!encodedAnnotations && element.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)) {
            element.removeAttribute(AUTHORED_VOCABULARY_ATTRIBUTE);
            changed = true;
        }
        if (changed) marked += 1;
    }
    return marked;
}

function isAcademyJapaneseSurface(element: HTMLElement): boolean {
    if (element.closest('[data-jpdb-reader-surface-ignore]')) return false;
    if (element.matches('script, style, noscript, textarea, input, select, option, [aria-hidden="true"]')) return false;
    if (element.closest(READER_OWNED_SURFACE_QUERY)) return false;
    return HAS_JAPANESE.test(element.textContent ?? '');
}

function ensureAcademyAnnotationLifecycle(): void {
    const root = document.getElementById(ACADEMY_ROOT_ID);
    if (!(root instanceof HTMLElement)) return;
    if (annotationLifecycle?.root === root && root.isConnected) return;
    annotationLifecycle?.dispose();
    const lifecycle = observeAcademyAnnotationSurfaces(root);
    annotationLifecycle = { root, dispose: lifecycle.dispose };
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
    if (hasConformingYomuRuntime()) return true;
    await waitForJapaneseSurface();
    if (hasConformingYomuRuntime()) return true;
    // A real userscript/extension may already own the page. Do not inject a
    // lower-priority duplicate; wait for its conformance handshake instead.
    if (hasYomuRuntime()) return waitForRuntimeReady();
    seedAcademyReaderDefaults();
    await loadStylesheet();
    if (!await loadReaderCompanions()) return false;
    const loaded = await loadCoreRuntime();
    return loaded && waitForRuntimeReady();
}

function hasYomuRuntime(): boolean {
    const runtimeWindow = window as Window & { __yomuReaderAppInitialized?: boolean };
    return Boolean(runtimeWindow.__yomuReaderAppInitialized || document.getElementById(RUNTIME_MARKER_ID));
}

function hasConformingYomuRuntime(): boolean {
    return readerRuntimeConforms(readReaderRuntimeHealth());
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

async function loadReaderCompanions(): Promise<boolean> {
    for (const companion of ACADEMY_READER_COMPANIONS) {
        if (!await loadCompanion(companion.fileName)) return false;
    }
    return true;
}

function loadCompanion(fileName: string): Promise<boolean> {
    const loaded = Array.from(document.querySelectorAll<HTMLScriptElement>(`script[${COMPANION_ATTRIBUTE}]`))
        .some(script => script.getAttribute(COMPANION_ATTRIBUTE) === fileName);
    return loaded
        ? Promise.resolve(true)
        : loadPlainScriptChain(academyRuntimeAssetCandidates(fileName), fileName);
}

function loadPlainScriptChain(candidates: readonly string[], fileName: string, index = 0): Promise<boolean> {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.async = false;
        script.src = candidates[index];
        script.setAttribute(COMPANION_ATTRIBUTE, fileName);
        script.addEventListener('load', () => resolve(true), { once: true });
        script.addEventListener('error', () => {
            script.remove();
            void loadPlainScriptChain(candidates, fileName, index + 1).then(resolve);
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
    if (hasConformingYomuRuntime()) return Promise.resolve(true);
    return new Promise(resolve => {
        const startedAt = performance.now();
        const check = () => {
            if (hasConformingYomuRuntime()) return resolve(true);
            if (performance.now() - startedAt >= timeoutMs) return resolve(false);
            window.setTimeout(check, 60);
        };
        check();
    });
}
