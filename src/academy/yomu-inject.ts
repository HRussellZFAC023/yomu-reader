/**
 * Brings Yomu's reader runtime into the Academy so that any Japanese line — a
 * lesson sentence, a VN dialogue, a vocab card — reads like the rest of Yomu:
 * furigana over the kanji, pitch colour, and a tap/hover dictionary popup.
 *
 * It works exactly the way the hosted PDF reader and video player do: instead of
 * bundling the whole reader into the Academy, we load the already-built public
 * bundle (`yomu.user.js` + `yomu.css`) from the same site. That script boots the
 * reader in "page" mode, scans the document for Japanese text, and decorates it —
 * English UI is left untouched because the reader only ever touches Japanese runs.
 *
 * We hold off until the Academy has actually rendered a Japanese surface
 * (`lang="ja"` / `[data-yomu-runtime-surface]`), so Yomu only spins up when there
 * is something for it to read. Everything is wrapped so a missing bundle or a
 * hostile CSP can never take the lesson down with it.
 */

const RUNTIME_MARKER_ID = 'jpdb-reader-runtime-owner';
const CORE_SCRIPT_ID = 'yomu-hosted-academy-runtime';
const CSS_ATTRIBUTE = 'data-yomu-hosted-academy-css';
const SCRIPT_ATTRIBUTE = 'data-yomu-hosted-academy-script';
const COMPANION_ATTRIBUTE = 'data-yomu-hosted-academy-companion';

const RUNTIME_READY_TIMEOUT_MS = 6000;
const SURFACE_WAIT_TIMEOUT_MS = 15000;

// The reader popup, furigana and pitch all live in the core bundle; these
// companions only add extras (mining to Anki, the kanji drill, the settings
// panel, HUD copy). They are loaded best-effort — a 404 on any of them must not
// stop the core runtime, and none of them are required for lookup to work.
const COMPANION_FILES = [
    'greasyfork/yomu-anki.user.js',
    'greasyfork/yomu-kanji-study.user.js',
    'greasyfork/yomu-settings-surface.user.js',
    'greasyfork/yomu-ui-copy.user.js',
];

// Where the Academy's Japanese lives. Waiting for one of these keeps the runtime
// scoped to real content instead of firing on an empty shell.
const JAPANESE_SURFACE_SELECTOR = '[lang="ja"], [data-yomu-runtime-surface]';

let bootPromise: Promise<boolean> | null = null;

/**
 * Boot the Yomu reader runtime for the Academy. Safe to call more than once —
 * the first call wins and later calls return the same result. Resolves `true`
 * once the runtime is live (or was already), `false` if it could not be loaded.
 */
export function initYomuReaderRuntime(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return Promise.resolve(false);
    }
    bootPromise ||= bootWhenJapaneseAppears().catch(() => false);
    return bootPromise;
}

async function bootWhenJapaneseAppears(): Promise<boolean> {
    // A reader installed as a userscript/extension, or an earlier boot, already
    // owns the page — don't fight it, just report success.
    if (hasYomuRuntime()) return true;
    await waitForJapaneseSurface();
    return ensureYomuRuntime();
}

function hasYomuRuntime(): boolean {
    const runtimeWindow = window as Window & { __yomuReaderAppInitialized?: boolean };
    return Boolean(
        runtimeWindow.__yomuReaderAppInitialized ||
        document.getElementById(RUNTIME_MARKER_ID) ||
        document.querySelector('.jpdb-reader-settings, .jpdb-subtitle-player'),
    );
}

function waitForJapaneseSurface(): Promise<void> {
    if (document.querySelector(JAPANESE_SURFACE_SELECTOR)) return Promise.resolve();
    return new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            observer?.disconnect();
            window.clearTimeout(timer);
            resolve();
        };
        const observer =
            typeof MutationObserver === 'undefined'
                ? undefined
                : new MutationObserver(() => {
                      if (document.querySelector(JAPANESE_SURFACE_SELECTOR)) finish();
                  });
        observer?.observe(document.documentElement, { childList: true, subtree: true });
        // Boot anyway after the timeout: the reader keeps its own observer alive,
        // so late Japanese still gets decorated even if we started early.
        const timer = window.setTimeout(finish, SURFACE_WAIT_TIMEOUT_MS);
    });
}

async function ensureYomuRuntime(): Promise<boolean> {
    if (hasYomuRuntime()) return true;
    await loadStylesheet();
    await loadCompanions();
    const coreLoaded = await loadCoreRuntime();
    return coreLoaded && waitForRuntimeReady();
}

/** Candidate URLs for a runtime asset, mirroring the PDF/video reader hosts. */
function assetCandidates(fileName: string): string[] {
    const here = window.location.href;
    const origin = window.location.origin;
    const urls = [
        new URL(`../${fileName}`, here),
        new URL(`./${fileName}`, here),
        new URL(`/${fileName}`, origin),
        new URL(`/yomu-reader/${fileName}`, origin),
    ];
    return [...new Set(urls.map(url => url.href))];
}

function loadStylesheet(): Promise<boolean> {
    if (document.querySelector(`link[${CSS_ATTRIBUTE}], link[href$="/yomu.css"], link[href*="/yomu.css?"]`)) {
        return Promise.resolve(true);
    }
    return loadLinkChain(assetCandidates('yomu.css'));
}

async function loadCompanions(): Promise<void> {
    for (const fileName of COMPANION_FILES) {
        if (document.querySelector(`script[${COMPANION_ATTRIBUTE}="${cssEscape(fileName)}"]`)) continue;
        await loadScriptChain(assetCandidates(fileName), 0, {
            attribute: COMPANION_ATTRIBUTE,
            attributeValue: fileName,
        });
    }
}

function loadCoreRuntime(): Promise<boolean> {
    if (hasYomuRuntime()) return Promise.resolve(true);
    if (document.getElementById(CORE_SCRIPT_ID) || document.querySelector(`script[${SCRIPT_ATTRIBUTE}]`)) {
        return waitForRuntimeReady();
    }
    return loadScriptChain(assetCandidates('yomu.user.js'), 0, {
        id: CORE_SCRIPT_ID,
        attribute: SCRIPT_ATTRIBUTE,
        waitForRuntime: true,
    });
}

interface ScriptLoadOptions {
    id?: string;
    attribute?: string;
    attributeValue?: string;
    // The core bundle "loading" fires before it has finished claiming the page;
    // only for the core do we confirm the runtime actually came up before
    // treating a candidate as good.
    waitForRuntime?: boolean;
}

function loadScriptChain(candidates: string[], index: number, options: ScriptLoadOptions): Promise<boolean> {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
        const script = document.createElement('script');
        if (options.id) script.id = options.id;
        script.async = false;
        script.src = candidates[index];
        script.setAttribute(options.attribute ?? SCRIPT_ATTRIBUTE, options.attributeValue ?? 'true');
        const tryNext = () => {
            script.remove();
            void loadScriptChain(candidates, index + 1, options).then(resolve);
        };
        script.addEventListener(
            'load',
            () => {
                if (!options.waitForRuntime) return resolve(true);
                void waitForRuntimeReady().then(ready => (ready ? resolve(true) : tryNext()));
            },
            { once: true },
        );
        script.addEventListener('error', tryNext, { once: true });
        (document.head ?? document.documentElement).append(script);
    });
}

function loadLinkChain(candidates: string[], index = 0): Promise<boolean> {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = candidates[index];
        link.setAttribute(CSS_ATTRIBUTE, 'true');
        link.addEventListener('load', () => resolve(true), { once: true });
        link.addEventListener(
            'error',
            () => {
                link.remove();
                void loadLinkChain(candidates, index + 1).then(resolve);
            },
            { once: true },
        );
        (document.head ?? document.documentElement).append(link);
    });
}

function waitForRuntimeReady(timeoutMs = RUNTIME_READY_TIMEOUT_MS): Promise<boolean> {
    if (hasYomuRuntime()) return Promise.resolve(true);
    return new Promise<boolean>(resolve => {
        const started = performance.now();
        const check = () => {
            if (hasYomuRuntime()) return resolve(true);
            if (performance.now() - started >= timeoutMs) return resolve(false);
            window.setTimeout(check, 60);
        };
        check();
    });
}

/** Minimal CSS.escape fallback for the companion attribute selector. */
function cssEscape(value: string): string {
    const globalCss = (window as Window & { CSS?: { escape?: (input: string) => string } }).CSS;
    if (typeof globalCss?.escape === 'function') return globalCss.escape(value);
    return value.replace(/["\\]/g, '\\$&');
}
