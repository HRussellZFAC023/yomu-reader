import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const USERSCRIPT_PATH = resolve('dist/yomu.user.js');
const CSS_PATH = resolve('dist/yomu.css');
const COMPANION_PATHS = ['yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => resolve('dist/greasyfork', name));

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const HOME_URL = 'https://www.youtube.com/';

const baseSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: false,
    showFloatingButton: false,
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleTranscriptVisible: true,
    subtitleTranscriptAutoScroll: false,
    subtitleControlsMode: 'auto',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'jpdb',
};

async function installUserscriptContext(context) {
    const css = readFileSync(CSS_PATH, 'utf8');
    const settings = { ...baseSettings };
    await context.addInitScript(({ css, settings, settingsKey }) => {
        const storage = new Map([[settingsKey, settings]]);
        const storageKey = key => `__yomu_feature_${key}`;
        function readStoredValue(key, fallback) {
            if (storage.has(key)) return storage.get(key);
            return readLocalStorageValue(key, fallback);
        }
        function readLocalStorageValue(key, fallback) {
            try {
                return JSON.parse(localStorage.getItem(storageKey(key)) || localStorage.getItem(key) || JSON.stringify(fallback));
            } catch {
                return fallback;
            }
        }
        function writeStoredValue(key, value) {
            storage.set(key, value);
            try {
                localStorage.setItem(storageKey(key), JSON.stringify(value));
                localStorage.setItem(key, JSON.stringify(value));
            } catch {}
        }
        writeStoredValue(settingsKey, settings);
        window.GM_getResourceText = name => name === 'yomuCss' ? css : '';
        window.GM_addStyle = stylesheet => {
            const style = document.createElement('style');
            style.textContent = stylesheet;
            (document.head || document.documentElement).append(style);
            return style;
        };
        window.GM_getValue = (key, fallback) => readStoredValue(key, fallback);
        window.GM_setValue = (key, value) => { writeStoredValue(key, value); };
        window.GM_deleteValue = key => {
            storage.delete(key);
            try {
                localStorage.removeItem(storageKey(key));
                localStorage.removeItem(key);
            } catch {}
        };
        window.GM_listValues = () => [...storage.keys()];
        window.GM = {
            getValue: window.GM_getValue,
            setValue: window.GM_setValue,
            deleteValue: window.GM_deleteValue,
            listValues: window.GM_listValues,
            addStyle: window.GM_addStyle,
        };
    }, { css, settings, settingsKey: SETTINGS_KEY });
    for (const companionPath of COMPANION_PATHS) {
        await context.addInitScript({ path: companionPath });
    }
    await context.addInitScript({ path: USERSCRIPT_PATH });
}

async function installRoutes(page) {
    await page.route('https://www.youtube.com/', route => route.fulfill({
        body: `<!doctype html><html><head><meta charset="utf-8"><title>YouTube</title></head><body><ytd-app><div id="chips"></div><ytd-rich-grid-renderer><ytd-rich-item-renderer data-case="jp"><a id="video-title-link" href="/watch?v=jp">JP</a></ytd-rich-item-renderer></ytd-rich-grid-renderer></ytd-app></body></html>`,
        contentType: 'text/html'
    }));
}

const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'en-GB' });
    await installUserscriptContext(context);
    const page = await context.newPage();
    await installRoutes(page);
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('ytd-rich-item-renderer[data-case="jp"]');

    // Seed video
    await page.evaluate(() => {
        const canvas = HTMLCanvasElement.prototype;
        const context = CanvasRenderingContext2D?.prototype;
        if (context) {
            Object.defineProperty(context, 'drawImage', { configurable: true, value: () => undefined });
        }
        Object.defineProperty(canvas, 'toDataURL', {
            configurable: true,
            value: () => 'data:image/jpeg;base64,ZmVhdHVyZS1wcmV2aWV3',
        });

        const video = document.createElement('video');
        video.dataset.case = 'homepage-preview-video';
        video.style.cssText = 'position:fixed;left:80px;top:96px;width:640px;height:360px;background:#111;z-index:1;';
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
        Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
        document.body.append(video);
        video.dispatchEvent(new Event('pause'));
    });

    console.log('Video seeded, waiting for .jpdb-ocr-video-frame in DOM...');
    await page.waitForSelector('.jpdb-ocr-video-frame', { timeout: 5000 });
    console.log('OCR frame in DOM!');

    // Wait a bit for layout
    await page.waitForTimeout(500);

    const info = await page.evaluate(() => {
        const resume = document.querySelector('.jpdb-ocr-video-frame-resume');
        if (!resume) return { error: 'No resume button found' };
        const style = window.getComputedStyle(resume);
        const rect = resume.getBoundingClientRect();
        return {
            tagName: resume.tagName,
            className: resume.className,
            parentId: resume.parentElement?.id,
            parentClass: resume.parentElement?.className,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            left: style.left,
            top: style.top,
            width: style.width,
            height: style.height,
            transform: style.transform,
            rect: {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
            },
            bodyWidth: document.body.clientWidth,
            bodyHeight: document.body.clientHeight,
        };
    });

    console.log('Resume button info:', JSON.stringify(info, null, 2));

    // Try to wait with Playwright
    console.log('Testing Playwright waitForSelector on resume button...');
    const result = await page.waitForSelector('.jpdb-ocr-video-frame-resume', { timeout: 3000 }).then(() => 'Visible!').catch(err => 'Hidden: ' + err.message);
    console.log('Playwright visibility status:', result);

} finally {
    await browser.close();
}
