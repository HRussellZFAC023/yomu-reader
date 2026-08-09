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
import { shouldInstallHostedReaderRuntime } from '../../reader/app/runtime-presence';
import {
    AUTHORED_VOCABULARY_ATTRIBUTE,
    encodeAuthoredVocabularyAnnotations,
} from '../../reader/lookup/authored-vocabulary';
import { loadHostedReaderRuntime } from '../../reader/app/hosted-runtime-graph';
import { academyAuthoredVocabularyForText } from './authored-reader-vocabulary';
import { prepareAcademyReadingSurface } from './reader-markup';

const RUNTIME_MARKER_ID = READER_RUNTIME_MARKER_ID;
const RUNTIME_SCRIPT_ID_PREFIX = 'yomu-hosted-academy-runtime';
const CSS_ATTRIBUTE = 'data-yomu-hosted-academy-css';
const JAPANESE_SURFACE_SELECTOR = '[lang="ja"], [lang^="ja-"], [data-yomu-runtime-surface], .academy-japanese';
const OWNED_READING_SURFACE_SELECTOR = '[data-yomu-runtime-surface]';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const RUNTIME_READY_TIMEOUT_MS = 6_000;
const ACADEMY_ROOT_ID = 'yomu-academy';
const ACADEMY_REVISION = /^s1-[a-f\d]{12}$/u;

type AcademyRuntimeDemand = 'install' | 'satisfied' | 'unavailable';
type AcademyRuntimePresence = 'absent' | 'conforming' | 'starting';
type AcademyRuntimeReadiness = Exclude<AcademyRuntimeDemand, 'install'>;

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
        attributeFilter: ['lang', 'data-reading-support', 'data-yomu-runtime-surface'],
    });
    return { dispose: () => observer.disconnect() };
}

export function refreshAcademyAnnotationSurfaces(root: ParentNode): number {
    const candidates = root instanceof HTMLElement && root.matches(JAPANESE_SURFACE_SELECTOR)
        ? [root, ...Array.from(root.querySelectorAll<HTMLElement>(JAPANESE_SURFACE_SELECTOR))]
        : Array.from(root.querySelectorAll<HTMLElement>(JAPANESE_SURFACE_SELECTOR));
    let marked = 0;
    for (const element of candidates) {
        const changed = prepareAcademyReadingSurface(element);
        if (!changed) continue;
        const annotations = academyAuthoredVocabularyForText(element.textContent ?? '');
        const encodedAnnotations = annotations.length ? encodeAuthoredVocabularyAnnotations(annotations) : '';
        if (encodedAnnotations && element.getAttribute(AUTHORED_VOCABULARY_ATTRIBUTE) !== encodedAnnotations) {
            element.setAttribute(AUTHORED_VOCABULARY_ATTRIBUTE, encodedAnnotations);
        } else if (!encodedAnnotations && element.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)) {
            element.removeAttribute(AUTHORED_VOCABULARY_ATTRIBUTE);
        }
        marked += 1;
    }
    return marked;
}

function ensureAcademyAnnotationLifecycle(): void {
    const root = document.getElementById(ACADEMY_ROOT_ID);
    if (!(root instanceof HTMLElement)) return;
    if (annotationLifecycle?.root === root && root.isConnected) return;
    annotationLifecycle?.dispose();
    const lifecycle = observeAcademyAnnotationSurfaces(root);
    annotationLifecycle = { root, dispose: lifecycle.dispose };
}

export function academyRuntimeAssetCandidates(
    fileName: string,
    href = window.location.href,
    revision?: string,
): string[] {
    const current = new URL(href);
    const versionedFileName = revision
        ? `${fileName}${fileName.includes('?') ? '&' : '?'}v=${encodeURIComponent(revision)}`
        : fileName;
    const urls = [
        new URL(`../${versionedFileName}`, current),
        new URL(`./${versionedFileName}`, current),
        new URL(`/${versionedFileName}`, current.origin),
        new URL(`/yomu-reader/${versionedFileName}`, current.origin),
    ];
    return [...new Set(urls.map(url => url.href))];
}

async function bootWhenJapaneseAppears(): Promise<boolean> {
    const demand = await academyRuntimeDemand();
    if (demand === 'satisfied') return true;
    if (demand === 'unavailable') return false;
    seedAcademyReaderDefaults();
    const revision = academyHostedRuntimeRevision();
    if (!revision) return false;
    return installAcademyReaderRuntime(revision);
}

async function academyRuntimeDemand(): Promise<AcademyRuntimeDemand> {
    if (academyRuntimePresence() !== 'conforming') {
        const surfaceReady = await waitForJapaneseSurface();
        if (!surfaceReady) return 'unavailable';
    }
    // A real userscript/extension may already own the page. Do not inject a
    // lower-priority duplicate; wait for its conformance handshake instead.
    if (academyRuntimePresence() === 'absent') return 'install';
    return waitForRuntimeReadiness();
}

async function installAcademyReaderRuntime(revision: string): Promise<boolean> {
    const stylesheetReady = await loadStylesheet(revision);
    if (!stylesheetReady) return false;
    try {
        await loadHostedReaderRuntime({
            resolveCandidates: script => academyRuntimeAssetCandidates(
                script.path,
                window.location.href,
                script.role === 'core' ? revision : undefined,
            ),
            scriptIdPrefix: RUNTIME_SCRIPT_ID_PREFIX,
        });
        return (await waitForRuntimeReadiness()) === 'satisfied';
    } catch {
        document.documentElement.dataset.yomuHostedRuntimeGraphError = 'true';
        return false;
    }
}

function academyRuntimePresence(): AcademyRuntimePresence {
    if (readerRuntimeConforms(readReaderRuntimeHealth())) return 'conforming';
    // Both installed and actively booting runtimes announce DOM ownership.
    // DOM markers cross userscript/extension realms; page-window flags do not.
    if (!shouldInstallHostedReaderRuntime()) return 'starting';
    if (document.getElementById(RUNTIME_MARKER_ID)) return 'starting';
    return 'absent';
}

function waitForJapaneseSurface(): Promise<boolean> {
    if (document.querySelector(OWNED_READING_SURFACE_SELECTOR)) return Promise.resolve(true);
    if (typeof MutationObserver === 'undefined') return Promise.resolve(false);
    return new Promise(resolve => {
        const observer = new MutationObserver(() => {
            if (!document.querySelector(OWNED_READING_SURFACE_SELECTOR)) return;
            observer.disconnect();
            resolve(true);
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-yomu-runtime-surface'],
            childList: true,
            subtree: true,
        });
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

function academyHostedRuntimeRevision(): string | undefined {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/hosted-runtime-graph.js"]');
    const revision = script ? new URL(script.src, window.location.href).searchParams.get('v') : null;
    if (revision && ACADEMY_REVISION.test(revision)) return revision;
    document.documentElement.dataset.yomuHostedRuntimeGraphError = 'true';
    return undefined;
}

function loadStylesheet(revision: string): Promise<boolean> {
    if (document.querySelector(`link[${CSS_ATTRIBUTE}], link[href$="/yomu.css"], link[href*="/yomu.css?"]`)) {
        return Promise.resolve(true);
    }
    return loadLinkChain(academyRuntimeAssetCandidates('yomu.css', window.location.href, revision));
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

function waitForRuntimeReadiness(timeoutMs = RUNTIME_READY_TIMEOUT_MS): Promise<AcademyRuntimeReadiness> {
    if (academyRuntimePresence() === 'conforming') return Promise.resolve('satisfied');
    return new Promise(resolve => {
        const startedAt = performance.now();
        const check = () => {
            if (academyRuntimePresence() === 'conforming') return resolve('satisfied');
            if (performance.now() - startedAt >= timeoutMs) return resolve('unavailable');
            window.setTimeout(check, 60);
        };
        check();
    });
}
