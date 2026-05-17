#!/usr/bin/env node
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import { loadLocalEnv } from './qa-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
loadLocalEnv(ROOT);

const DEFAULT_USERSCRIPT = path.join(ROOT, 'dist/yomu.user.js');
const DEFAULT_PROFILE = path.join(process.env.TMPDIR ?? '/tmp', 'yomu-real-screenshot-profile');
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CAPTURE_THEME = 'dark';
const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const CAPTURE_API_KEY = captureApiKey();

const scenarios = [
    {
        id: 'docs-popup-lookup',
        label: 'Docs popup lookup',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        urlEnv: 'YOMU_CAPTURE_READING_URL',
        hosts: ['ja.wikipedia.org'],
        output: 'docs/public/screenshots/real-popup-lookup.png',
        viewport: { width: 1280, height: 900 },
        validators: ['realPage', 'popover', 'translation', 'grammar'],
        instructions: [
            'Open a real lookup popup on Japanese text.',
            'Open the Translation and Grammar sections.',
            'Wait until the translation is generated and grammar hints are visible.',
        ],
    },
    {
        id: 'docs-kanji-drilldown',
        label: 'Docs kanji drilldown',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        urlEnv: 'YOMU_CAPTURE_READING_URL',
        hosts: ['ja.wikipedia.org'],
        output: 'docs/public/screenshots/real-kanji-drilldown.png',
        viewport: { width: 1280, height: 900 },
        validators: ['realPage', 'popover', 'kanji'],
        instructions: [
            'Open a Yomu popup on real Japanese text.',
            'Click into a kanji drilldown.',
            'Open the stroke/kanji details so the kanji facts and stroke SVG are visible.',
        ],
    },
    {
        id: 'docs-immersion-popover',
        label: 'Docs immersion popover',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        urlEnv: 'YOMU_CAPTURE_READING_URL',
        hosts: ['ja.wikipedia.org'],
        output: 'docs/public/screenshots/real-immersion-popover.png',
        viewport: { width: 1280, height: 900 },
        validators: ['realPage', 'popover', 'immersion'],
        instructions: [
            'Open a Yomu popup on a word with real Immersion Kit/Nadeshiko examples.',
            'Open the Immersion section.',
            'Reveal the example translation if it is blurred.',
        ],
    },
    {
        id: 'docs-dictionaries',
        label: 'Docs dictionaries settings',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        urlEnv: 'YOMU_CAPTURE_READING_URL',
        hosts: ['ja.wikipedia.org'],
        output: 'docs/public/screenshots/real-dictionaries.png',
        viewport: { width: 640, height: 760 },
        validators: ['realPage', 'settingsDictionaries'],
        instructions: [
            'Open Yomu settings.',
            'Select Dictionaries.',
            'Ensure at least one real imported Yomitan dictionary row is visible.',
        ],
    },
    {
        id: 'docs-ocr-settings',
        label: 'Docs OCR settings',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        urlEnv: 'YOMU_CAPTURE_READING_URL',
        hosts: ['ja.wikipedia.org'],
        output: 'docs/public/screenshots/real-ocr-settings.png',
        viewport: { width: 640, height: 760 },
        validators: ['realPage', 'settingsImages'],
        instructions: [
            'Open Yomu settings.',
            'Select Images.',
            'Ensure the real OCR provider/settings controls are visible.',
        ],
    },
    {
        id: 'docs-video-cij',
        label: 'Docs CIJ transcript panel',
        url: 'https://cijapanese.com/video/560',
        urlEnv: 'YOMU_CAPTURE_CIJ_URL',
        hosts: ['cijapanese.com', 'www.cijapanese.com'],
        output: 'docs/public/screenshots/real-video-player.png',
        viewport: { width: 1600, height: 900 },
        validators: ['realPage', 'cijAvailable', 'videoTranscript'],
        instructions: [
            'Log into CIJ in this browser profile if the page requires membership.',
            'Open/play the real CIJ video.',
            'Open the Yomu subtitle side panel in Lines mode with an active Japanese row visible.',
        ],
    },
    {
        id: 'docs-youtube-cij',
        label: 'Docs YouTube CIJ subtitles',
        url: 'https://www.youtube.com/watch?v=85bkMU2vu2I&t=45s',
        urlEnv: 'YOMU_CAPTURE_YOUTUBE_URL',
        hosts: ['www.youtube.com'],
        output: 'docs/public/screenshots/real-youtube-cij.png',
        viewport: { width: 1280, height: 900 },
        youtubeConsent: true,
        validators: ['realPage', 'youtubeVideo', 'videoTranscript'],
        instructions: [
            'Use the real youtube.com watch page.',
            'Play the video muted if needed.',
            'Open the Yomu subtitle side panel in Lines mode with an active Japanese row visible.',
        ],
    },
    {
        id: 'docs-ocr-manga',
        label: 'Docs OCR manga',
        url: 'https://www.mangaz.com/book/detail/127001',
        urlEnv: 'YOMU_CAPTURE_OCR_URL',
        hosts: ['www.mangaz.com', 'mangaz.com', 'commons.wikimedia.org', 'upload.wikimedia.org'],
        output: 'docs/public/screenshots/real-ocr-manga.png',
        viewport: { width: 1280, height: 900 },
        validators: ['realPage', 'ocr'],
        instructions: [
            'Open a real manga/image page that exposes real img elements, not canvas-only content.',
            'Run Yomu image reading and wait for OCR boxes.',
            'Activate or pin an OCR line, or open a Yomu popup from recognized text.',
        ],
    },
    {
        id: 'docs-newtab',
        label: 'Docs new-tab study',
        url: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        urlEnv: 'YOMU_CAPTURE_NEWTAB_URL',
        hosts: ['hrussellzfac023.github.io'],
        output: 'docs/public/screenshots/real-newtab.png',
        viewport: { width: 1280, height: 900 },
        inject: false,
        validators: ['realPage', 'newtab'],
        instructions: [
            'Load the real hosted/new-tab page with real cached JPDB, Anki, or imported-dictionary data.',
            'Reveal the current card answer/details before capturing.',
        ],
    },
    {
        id: 'docs-help-settings',
        label: 'Docs help settings',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        urlEnv: 'YOMU_CAPTURE_READING_URL',
        hosts: ['ja.wikipedia.org'],
        output: 'docs/public/screenshots/real-help-settings.png',
        viewport: { width: 640, height: 760 },
        validators: ['realPage', 'settingsHelp'],
        instructions: [
            'Open Yomu settings.',
            'Select Help.',
            'Ensure the real support/reset/link controls are visible.',
        ],
    },
    {
        id: 'store-popup-lookup',
        label: 'Store popup lookup',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        urlEnv: 'YOMU_CAPTURE_READING_URL',
        hosts: ['ja.wikipedia.org'],
        output: 'docs/public/screenshots/store-01-popup-lookup.png',
        viewport: { width: 1280, height: 800 },
        validators: ['realPage', 'popover', 'translation', 'grammar'],
        instructions: [
            'Open a polished popup on real Japanese text.',
            'Open Translation and Grammar with generated content visible.',
        ],
    },
    {
        id: 'store-youtube-subtitles',
        label: 'Store YouTube subtitles',
        url: 'https://www.youtube.com/watch?v=85bkMU2vu2I&t=45s',
        urlEnv: 'YOMU_CAPTURE_YOUTUBE_URL',
        hosts: ['www.youtube.com'],
        output: 'docs/public/screenshots/store-02-youtube-subtitles.png',
        viewport: { width: 1280, height: 800 },
        youtubeConsent: true,
        validators: ['realPage', 'youtubeVideo', 'videoTranscript'],
        instructions: [
            'Use the real youtube.com watch page.',
            'Open the Yomu subtitle side panel with active Japanese lines visible.',
        ],
    },
    {
        id: 'store-cij-transcript-panel',
        label: 'Store CIJ transcript panel',
        url: 'https://cijapanese.com/video/560',
        urlEnv: 'YOMU_CAPTURE_CIJ_URL',
        hosts: ['cijapanese.com', 'www.cijapanese.com'],
        output: 'docs/public/screenshots/store-03-cij-transcript-panel.png',
        viewport: { width: 1280, height: 800 },
        validators: ['realPage', 'cijAvailable', 'videoTranscript'],
        instructions: [
            'Log into CIJ in this browser profile if needed.',
            'Open the real video and Yomu transcript side panel with an active line visible.',
        ],
    },
    {
        id: 'store-ocr-manga',
        label: 'Store OCR manga',
        url: 'https://www.mangaz.com/book/detail/127001',
        urlEnv: 'YOMU_CAPTURE_OCR_URL',
        hosts: ['www.mangaz.com', 'mangaz.com', 'commons.wikimedia.org', 'upload.wikimedia.org'],
        output: 'docs/public/screenshots/store-04-ocr-manga.png',
        viewport: { width: 1280, height: 800 },
        validators: ['realPage', 'ocr'],
        instructions: [
            'Use real manga/image content from a live page.',
            'Show Yomu OCR boxes and an active OCR line or popup.',
        ],
    },
    {
        id: 'store-dictionaries-settings',
        label: 'Store dictionaries settings',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        urlEnv: 'YOMU_CAPTURE_READING_URL',
        hosts: ['ja.wikipedia.org'],
        output: 'docs/public/screenshots/store-05-dictionaries-settings.png',
        viewport: { width: 1280, height: 800 },
        validators: ['realPage', 'settingsDictionaries'],
        instructions: [
            'Open Yomu settings on Dictionaries.',
            'Show real imported dictionary rows and source ordering.',
        ],
    },
];

function usage() {
    return `Usage: node scripts/capture-real-screenshots.mjs [options]

Strict, operator-run Playwright capture for real Yomu docs/store screenshots.

Options:
  --list                         List capture scenarios.
  --scenario <id[,id]>           Capture one or more scenarios. Repeatable.
  --group <docs|store>           Capture all scenarios in a group.
  --profile <dir>                Persistent browser profile. Default: ${DEFAULT_PROFILE}
  --userscript <file>            Built userscript to inject. Default: ${DEFAULT_USERSCRIPT}
  --out-dir <dir>                Write basenames to this directory instead of repo screenshot paths.
  --url <id=url>                 Override a scenario URL.
  --auto                         Validate and capture immediately without the operator prompt.
  --theme <dark|light|auto>       Seed Yomu display theme for each live origin. Default: ${DEFAULT_CAPTURE_THEME}
  --headless                     Run headless. Usually not useful for operator capture.
  --no-inject                    Do not inject dist/yomu.user.js.
  --timeout-ms <ms>              Navigation/validation timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --help                         Show this help.

Live URL environment overrides:
  YOMU_CAPTURE_READING_URL, YOMU_CAPTURE_CIJ_URL, YOMU_CAPTURE_YOUTUBE_URL,
  YOMU_CAPTURE_OCR_URL, YOMU_CAPTURE_NEWTAB_URL
`;
}

function parseArgs(argv) {
    const args = {
        auto: false,
        group: '',
        headless: false,
        list: false,
        noInject: false,
        outDir: '',
        profile: process.env.YOMU_CAPTURE_PROFILE || DEFAULT_PROFILE,
        scenarioIds: [],
        theme: process.env.YOMU_CAPTURE_THEME || DEFAULT_CAPTURE_THEME,
        timeoutMs: Number(process.env.YOMU_CAPTURE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
        urlOverrides: new Map(),
        userscript: process.env.YOMU_CAPTURE_USERSCRIPT || DEFAULT_USERSCRIPT,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help' || arg === '-h') {
            console.log(usage());
            process.exit(0);
        } else if (arg === '--list') {
            args.list = true;
        } else if (arg === '--auto') {
            args.auto = true;
        } else if (arg === '--headless') {
            args.headless = true;
        } else if (arg === '--theme') {
            args.theme = readValue(argv, ++index, arg);
        } else if (arg === '--no-inject') {
            args.noInject = true;
        } else if (arg === '--scenario' || arg === '--only') {
            args.scenarioIds.push(...readValue(argv, ++index, arg).split(',').map(value => value.trim()).filter(Boolean));
        } else if (arg === '--group') {
            args.group = readValue(argv, ++index, arg);
        } else if (arg === '--profile') {
            args.profile = readValue(argv, ++index, arg);
        } else if (arg === '--userscript') {
            args.userscript = readValue(argv, ++index, arg);
        } else if (arg === '--out-dir') {
            args.outDir = readValue(argv, ++index, arg);
        } else if (arg === '--timeout-ms') {
            args.timeoutMs = Number(readValue(argv, ++index, arg));
        } else if (arg === '--url') {
            const value = readValue(argv, ++index, arg);
            const separator = value.indexOf('=');
            if (separator < 1) throw new Error(`Expected --url <scenario=url>, received ${value}`);
            args.urlOverrides.set(value.slice(0, separator), value.slice(separator + 1));
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }

    if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
        throw new Error(`Invalid --timeout-ms value: ${args.timeoutMs}`);
    }
    if (!['dark', 'light', 'auto'].includes(args.theme)) {
        throw new Error(`Invalid --theme value: ${args.theme}`);
    }
    return args;
}

function readValue(argv, index, flag) {
    const value = argv[index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    return value;
}

function selectedScenarios(args) {
    if (args.group) {
        if (!['docs', 'store'].includes(args.group)) throw new Error(`Unknown group: ${args.group}`);
        return scenarios.filter(scenario => scenario.id.startsWith(`${args.group}-`));
    }
    if (!args.scenarioIds.length) return [];
    return args.scenarioIds.map(id => {
        const scenario = scenarios.find(candidate => candidate.id === id);
        if (!scenario) throw new Error(`Unknown scenario: ${id}`);
        return scenario;
    });
}

function listScenarios() {
    const rows = scenarios.map(scenario => ({
        id: scenario.id,
        viewport: `${scenario.viewport.width}x${scenario.viewport.height}`,
        output: scenario.output,
        url: scenario.urlEnv ? `$${scenario.urlEnv} or ${scenario.url}` : scenario.url,
    }));
    console.table(rows);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.list) {
        listScenarios();
        return;
    }

    const selected = selectedScenarios(args);
    if (!selected.length) {
        console.log(usage());
        throw new Error('Choose at least one --scenario or --group.');
    }

    if (!args.noInject && selected.some(scenario => scenario.inject !== false)) {
        await assertReadableFile(args.userscript, `Userscript not found: ${args.userscript}. Run npm run build or pass --userscript.`);
    }
    if (!args.auto && !process.stdin.isTTY) {
        throw new Error('Operator capture requires a TTY. Use --auto only when the page state is already scripted externally.');
    }

    const rl = args.auto ? null : createInterface({ input: process.stdin, output: process.stdout });
    const context = await chromium.launchPersistentContext(path.resolve(args.profile), {
        headless: args.headless,
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
    });
    await installCaptureUserscriptBridge(context);
    await installCaptureSettingsSeed(context, args.theme);

    try {
        for (const scenario of selected) {
            await captureScenario(context, scenario, args, rl);
        }
    } finally {
        await context.close();
        rl?.close();
    }
}

async function captureScenario(context, scenario, args, rl) {
    const url = scenarioUrl(scenario, args);
    assertLiveUrl(url, scenario.hosts, scenario.id);
    const outputPath = screenshotPath(scenario, args);
    const page = await context.newPage();

    try {
        await page.setViewportSize(scenario.viewport);
        await page.emulateMedia({ colorScheme: args.theme === 'light' ? 'light' : 'dark' });
        if (scenario.youtubeConsent) await installYouTubeConsentCookies(context);
        console.log(`\n== ${scenario.id} ==`);
        console.log(`URL: ${url}`);
        console.log(`Viewport: ${scenario.viewport.width}x${scenario.viewport.height}`);
        console.log(`Output: ${outputPath}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
        await waitForStablePage(page);
        if (!args.noInject && scenario.inject !== false) await injectUserscript(page, args.userscript);
        await dismissKnownConsentDialogs(page);
        await prepareYomuScenario(page, scenario);
        if (scenario.validators.includes('videoTranscript')) await prepareVideoTranscriptScenario(page, url);

        if (!args.auto) {
            console.log('\nPrepare the page state:');
            for (const instruction of scenario.instructions) console.log(`  - ${instruction}`);
            await rl.question('\nPress Enter to validate and save this real screenshot, or Ctrl-C to abort. ');
        }

        if (scenario.validators.includes('videoTranscript')) await centerActiveTranscriptRow(page);
        await validateScenario(page, scenario, args.timeoutMs, args.theme, url);
        if (scenario.validators.includes('videoTranscript')) await settleVideoScreenshotFrame(page);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await page.screenshot({ path: outputPath, fullPage: false, animations: 'disabled' });
        console.log(`Saved ${outputPath}`);
    } finally {
        await page.close();
    }
}

async function prepareYomuScenario(page, scenario) {
    if (scenario.validators.some(validator => ['popover', 'translation', 'grammar', 'immersion', 'kanji'].includes(validator))) {
        await prepareLookupScenario(page, scenario.validators);
    }
    if (scenario.validators.includes('settingsDictionaries')) await prepareSettingsScenario(page, 'dictionaries');
    if (scenario.validators.includes('settingsImages')) await prepareSettingsScenario(page, 'media');
    if (scenario.validators.includes('settingsHelp')) await prepareSettingsScenario(page, 'help');
    if (scenario.validators.includes('newtab')) await prepareNewTabScenario(page);
}

async function prepareLookupScenario(page, validators) {
    await page.waitForSelector('.jpdb-reader-word', { timeout: 20_000 }).catch(() => undefined);
    const target = await page.evaluate(() => {
        const words = [...document.querySelectorAll('.jpdb-reader-word')]
            .filter(element => {
                const text = element.textContent || '';
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return /[\u3040-\u30ff\u3400-\u9fff]/u.test(text)
                    && rect.width > 8
                    && rect.height > 8
                    && rect.top >= 80
                    && rect.bottom <= innerHeight - 24
                    && style.display !== 'none'
                    && style.visibility !== 'hidden';
            });
        const preferred = words.find(element => {
            const text = element.textContent || '';
            return /日本語|日本|言語/.test(text) || (text.includes('本') && text.includes('語'));
        }) || words[0];
        if (!preferred) return null;
        const rect = preferred.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    if (target) await page.mouse.click(target.x, target.y);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 20_000 }).catch(() => undefined);
    await page.evaluate(validators => {
        const root = document.querySelector('.jpdb-reader-popover');
        const openDetails = selector => {
            const details = root?.querySelector(selector);
            if (!(details instanceof HTMLDetailsElement)) return;
            if (!details.open) details.querySelector('summary')?.click();
        };
        if (validators.includes('translation')) openDetails('details[data-study-translation]');
        if (validators.includes('grammar')) openDetails('details[data-study-grammar]');
        if (validators.includes('immersion')) openDetails('[data-immersion-kit]');
    }, validators);
    if (validators.includes('kanji')) {
        await page.locator('.jpdb-reader-popover [data-action="kanji"][data-kanji]').first().click({ timeout: 8000 }).catch(() => undefined);
        await page.waitForSelector('.jpdb-reader-kanji-display', { timeout: 15_000 }).catch(() => undefined);
        await page.evaluate(() => {
            const details = document.querySelector('.jpdb-reader-popover details.jpdb-reader-kanjivg');
            if (details instanceof HTMLDetailsElement && !details.open) details.querySelector('summary')?.click();
        });
    }
    await page.waitForTimeout(12_000);
    if (validators.includes('translation') || validators.includes('grammar')) {
        await page.evaluate(() => {
            const body = document.querySelector('.jpdb-reader-popover-body');
            const target = document.querySelector('details[data-study-translation], details[data-study-grammar]');
            if (body instanceof HTMLElement && target instanceof HTMLElement) {
                body.scrollTop = Math.max(0, target.offsetTop - body.clientHeight * 0.16);
            }
        });
        await page.waitForTimeout(300);
    }
}

async function prepareSettingsScenario(page, panel) {
    await page.waitForSelector('.jpdb-reader-fab', { timeout: 12_000 }).catch(() => undefined);
    await page.locator('.jpdb-reader-fab').click({ timeout: 8000 }).catch(() => undefined);
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 12_000 }).catch(() => undefined);
    await page.locator(`.jpdb-reader-settings [data-action="settings-panel"][data-panel="${panel}"]`).click({ timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(750);
}

async function prepareNewTabScenario(page) {
    await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { timeout: 20_000 }).catch(() => undefined);
    await page.locator('[data-newtab-action="show-answer"], [data-action="show-answer"], button:has-text("Show")').first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
}

async function installCaptureUserscriptBridge(context) {
    await context.exposeFunction('__yomuCaptureRequest', async request => {
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: decodeCaptureRequestBody(request.data),
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
            status: response.status,
            responseText: buffer.toString('utf8'),
            bytes: [...buffer],
            contentType: response.headers.get('content-type') ?? '',
        };
    });
    await context.addInitScript(() => {
        const storagePrefix = '__yomu_capture_gm__';
        const memoryStore = new Map();
        const storageKey = key => `${storagePrefix}${key}`;
        const readStoredValue = (key, fallback) => {
            try {
                const stored = localStorage.getItem(storageKey(key));
                return stored == null ? fallback : JSON.parse(stored);
            } catch {
                return memoryStore.has(key) ? memoryStore.get(key) : fallback;
            }
        };
        const writeStoredValue = (key, value) => {
            memoryStore.set(key, value);
            try {
                localStorage.setItem(storageKey(key), JSON.stringify(value));
            } catch {
                // Some capture targets restrict storage; in-memory values still keep this page working.
            }
        };
        const serializeBody = async data => {
            if (data instanceof ArrayBuffer) return { kind: 'arraybuffer', bytes: [...new Uint8Array(data)] };
            if (ArrayBuffer.isView(data)) return { kind: 'arraybuffer', bytes: [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)] };
            if (data instanceof FormData) {
                const entries = [];
                for (const [name, value] of data.entries()) {
                    if (value instanceof Blob) {
                        entries.push({
                            name,
                            blob: {
                                bytes: [...new Uint8Array(await value.arrayBuffer())],
                                type: value.type,
                                filename: value.name || 'file',
                            },
                        });
                    } else {
                        entries.push({ name, value: String(value) });
                    }
                }
                return { kind: 'formdata', entries };
            }
            return data;
        };
        window.GM_getValue = (key, fallback) => readStoredValue(key, fallback);
        window.GM_setValue = (key, value) => { writeStoredValue(key, value); };
        window.GM_deleteValue = key => {
            memoryStore.delete(key);
            try {
                localStorage.removeItem(storageKey(key));
            } catch {
                // Ignore restricted storage during capture.
            }
        };
        window.GM_listValues = () => {
            const keys = new Set(memoryStore.keys());
            try {
                for (let index = 0; index < localStorage.length; index += 1) {
                    const key = localStorage.key(index);
                    if (key?.startsWith(storagePrefix)) keys.add(key.slice(storagePrefix.length));
                }
            } catch {
                // Ignore restricted storage during capture.
            }
            return [...keys];
        };
        window.GM_addStyle = css => {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement || document.body).append(style);
            return style;
        };
        window.GM_registerMenuCommand = () => undefined;
        window.GM_xmlhttpRequest = options => {
            let settled = false;
            const timeoutMs = Number(options.timeout) || 0;
            const timer = timeoutMs > 0 ? window.setTimeout(() => {
                if (settled) return;
                settled = true;
                options.ontimeout?.({ status: 0, response: null, responseText: '' });
            }, timeoutMs) : 0;
            const settle = callback => value => {
                if (settled) return;
                settled = true;
                if (timer) window.clearTimeout(timer);
                callback(value);
            };
            Promise.resolve(serializeBody(options.data)).then(data => window.__yomuCaptureRequest({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data,
            })).then(result => {
                if (settled) return;
                const bytes = new Uint8Array(result.bytes);
                const response = options.responseType === 'arraybuffer'
                    ? bytes.buffer
                    : options.responseType === 'blob'
                        ? new Blob([bytes], { type: result.contentType })
                        : options.responseType === 'json'
                            ? JSON.parse(result.responseText || 'null')
                            : result.responseText;
                settle(options.onload ?? (() => undefined))({
                    status: result.status,
                    response,
                    responseText: result.responseText,
                });
            }).catch(settle(error => options.onerror?.(error)));
        };
        window.GM = {
            getValue: window.GM_getValue,
            setValue: window.GM_setValue,
            deleteValue: window.GM_deleteValue,
            listValues: window.GM_listValues,
            addStyle: window.GM_addStyle,
            registerMenuCommand: window.GM_registerMenuCommand,
            xmlHttpRequest: window.GM_xmlhttpRequest,
        };
    });
}

function decodeCaptureRequestBody(data) {
    if (!data || typeof data !== 'object') return data;
    if (data.kind === 'arraybuffer') return Buffer.from(data.bytes ?? []);
    if (data.kind === 'formdata') {
        const formData = new FormData();
        for (const entry of data.entries ?? []) {
            if (entry.blob) {
                formData.append(entry.name, new Blob([Buffer.from(entry.blob.bytes ?? [])], { type: entry.blob.type || 'application/octet-stream' }), entry.blob.filename || 'file');
            } else {
                formData.append(entry.name, entry.value ?? '');
            }
        }
        return formData;
    }
    return data;
}

async function installCaptureSettingsSeed(context, theme) {
    await context.addInitScript(({ key, settings }) => {
        const gmKey = `__yomu_capture_gm__${key}`;
        try {
            const stored = localStorage.getItem(key);
            const parsed = stored ? JSON.parse(stored) : {};
            const value = parsed && typeof parsed === 'object' ? parsed : {};
            localStorage.setItem(key, JSON.stringify({ ...value, ...settings }));
        } catch {
            localStorage.setItem(key, JSON.stringify(settings));
        }
        try {
            const stored = localStorage.getItem(gmKey);
            const parsed = stored ? JSON.parse(stored) : {};
            const value = parsed && typeof parsed === 'object' ? parsed : {};
            localStorage.setItem(gmKey, JSON.stringify({ ...value, ...settings }));
        } catch {
            localStorage.setItem(gmKey, JSON.stringify(settings));
        }
    }, {
        key: SETTINGS_STORAGE_KEY,
        settings: captureSeedSettings(theme),
    });
}

function captureApiKey() {
    return process.env.YOMU_CAPTURE_API_KEY?.trim()
        || process.env.YOMU_TEST_API_KEY?.trim()
        || process.env.YOMU_PROFILE_API_KEY?.trim()
        || '';
}

function captureSeedSettings(theme) {
    return {
        ...(CAPTURE_API_KEY ? { apiKey: CAPTURE_API_KEY } : {}),
        onboardingSeen: true,
        theme,
        jpdbMiningEnabled: true,
        localDictionariesEnabled: true,
        subtitlePlayerEnabled: true,
        subtitleAutoDetect: true,
        subtitleOverlayVisible: true,
        subtitleTranscriptVisible: true,
        subtitleControlsMode: 'always',
        subtitleHighlightColorSource: 'jpdb',
        subtitleUnderlineColorSource: 'pitch',
        subtitleTextColorSource: 'jpdb',
    };
}

function scenarioUrl(scenario, args) {
    return args.urlOverrides.get(scenario.id)
        || process.env[scenario.urlEnv]
        || scenario.url;
}

function screenshotPath(scenario, args) {
    if (args.outDir) return path.resolve(args.outDir, path.basename(scenario.output));
    return path.resolve(ROOT, scenario.output);
}

async function assertReadableFile(filePath, message) {
    try {
        await access(path.resolve(filePath));
    } catch {
        throw new Error(message);
    }
}

function assertLiveUrl(value, allowedHosts, scenarioId) {
    const url = parseUrl(value, `${scenarioId}: invalid URL`);
    if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error(`${scenarioId}: only http(s) live pages are allowed, got ${url.protocol}`);
    }
    if (url.protocol !== 'https:') {
        throw new Error(`${scenarioId}: screenshots must use https live pages, got ${url.href}`);
    }
    if (LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith('.local')) {
        throw new Error(`${scenarioId}: local/fixture hosts are not allowed (${url.hostname})`);
    }
    if (!allowedHosts.includes(url.hostname)) {
        throw new Error(`${scenarioId}: expected one of ${allowedHosts.join(', ')}, got ${url.hostname}`);
    }
}

function parseUrl(value, message) {
    try {
        return new URL(value);
    } catch {
        throw new Error(`${message}: ${value}`);
    }
}

async function waitForStablePage(page) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForFunction(() => [...document.images].every(image => image.complete), null, { timeout: 8_000 }).catch(() => undefined);
}

async function injectUserscript(page, userscriptPath) {
    const resolved = path.resolve(userscriptPath);
    try {
        await page.addScriptTag({ path: resolved });
    } catch {
        const client = await page.context().newCDPSession(page);
        await client.send('Runtime.evaluate', {
            expression: await readFile(resolved, 'utf8'),
            awaitPromise: false,
            allowUnsafeEvalBlockedByCSP: true,
            replMode: true,
        });
    }
    await page.waitForTimeout(750);
}

async function installYouTubeConsentCookies(context) {
    const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    await context.addCookies([
        { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+410', domain: '.youtube.com', path: '/', expires, sameSite: 'Lax', secure: true },
        { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+410', domain: '.google.com', path: '/', expires, sameSite: 'Lax', secure: true },
        { name: 'PREF', value: 'hl=en-GB&tz=Europe.London&f6=400', domain: '.youtube.com', path: '/', expires, sameSite: 'Lax', secure: true },
    ]);
}

async function dismissKnownConsentDialogs(page) {
    for (const label of [/Reject all/i, /Accept all/i, /I agree/i, /Got it/i, /閉じる/, /同意/]) {
        const button = page.getByRole('button', { name: label }).first();
        if (!await button.count()) continue;
        try {
            await button.click({ timeout: 1800 });
            await page.waitForTimeout(5000);
            return;
        } catch {
            // Keep trying known consent labels; validation will fail if an overlay remains.
        }
    }
    const clicked = await page.evaluate(() => {
        const labels = /^(Reject all|Accept all|I agree|Got it|閉じる|同意)$/i;
        const candidates = [...document.querySelectorAll('button, [role="button"], tp-yt-paper-button, ytd-button-renderer')];
        for (const element of candidates) {
            const text = (element instanceof HTMLElement ? element.innerText : element.textContent || '').replace(/\s+/g, ' ').trim();
            if (!labels.test(text)) continue;
            const rect = element instanceof HTMLElement ? element.getBoundingClientRect() : null;
            if (!rect || rect.width < 2 || rect.height < 2) continue;
            const button = element.matches('button') ? element : element.querySelector('button');
            (button || element).click();
            return true;
        }
        return false;
    });
    if (clicked) await page.waitForTimeout(5000);
}

async function prepareVideoTranscriptScenario(page, url) {
    const targetSeconds = videoStartSeconds(url);
    await prepareVideoPlayback(page, targetSeconds);
    if (new URL(url).hostname.includes('youtube.com')) {
        await waitPastYouTubeAds(page);
        await prepareVideoPlayback(page, targetSeconds);
    }
    await page.waitForTimeout(1500);
}

async function prepareVideoPlayback(page, targetSeconds) {
    await page.evaluate(async targetSeconds => {
        if (location.hostname.includes('youtube.com')) {
            const watch = document.querySelector('ytd-watch-flexy');
            const theaterButton = document.querySelector('.ytp-size-button');
            if (watch && theaterButton instanceof HTMLElement && !watch.hasAttribute('theater')) theaterButton.click();
        }
        const video = document.querySelector('video');
        if (!(video instanceof HTMLVideoElement)) return;
        video.muted = true;
        if (Number.isFinite(targetSeconds) && Math.abs(video.currentTime - targetSeconds) > 2) {
            video.currentTime = targetSeconds;
        }
        await video.play().catch(() => undefined);
    }, targetSeconds);
}

async function waitPastYouTubeAds(page) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const state = await page.evaluate(() => {
            const player = document.querySelector('#movie_player');
            const adShowing = Boolean(player?.classList.contains('ad-showing') || document.querySelector('.ytp-ad-player-overlay, .ytp-ad-preview-container'));
            const skipButton = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
            if (skipButton && getComputedStyle(skipButton).display !== 'none') skipButton.click();
            return { adShowing, skipped: Boolean(skipButton) };
        });
        if (!state.adShowing) return;
        await page.waitForTimeout(state.skipped ? 1500 : 1000);
    }
}

async function settleVideoScreenshotFrame(page) {
    await page.mouse.move(12, 12);
    await page.waitForTimeout(2200);
    await centerActiveTranscriptRow(page);
}

async function centerActiveTranscriptRow(page) {
    await page.evaluate(() => {
        const active = document.querySelector('.jpdb-subtitle-list:not([hidden]) .jpdb-subtitle-list-row.active');
        if (active instanceof HTMLElement) active.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    await page.waitForTimeout(250);
}

function videoStartSeconds(url) {
    const parsed = parseUrl(url, 'invalid video URL');
    const raw = parsed.searchParams.get('t') || parsed.searchParams.get('start') || '';
    if (!raw) return Number.NaN;
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
    if (match && (match[1] || match[2] || match[3])) {
        return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
    }
    const number = Number(raw.replace(/s$/i, ''));
    return Number.isFinite(number) ? number : Number.NaN;
}

async function validateScenario(page, scenario, timeoutMs, theme, expectedUrl) {
    await page.waitForFunction(() => document.body && document.body.innerText.length > 0, null, { timeout: timeoutMs });
    assertLiveUrl(page.url(), scenario.hosts, scenario.id);

    const deadline = Date.now() + timeoutMs;
    let result;
    do {
        result = await evaluateScenarioChecks(page, scenario, theme, expectedUrl);
        if (!result.checks.some(check => !check.ok)) break;
        await page.waitForTimeout(1000);
    } while (Date.now() < deadline);

    const failures = result.checks.filter(check => !check.ok);
    if (failures.length) {
        const lines = failures.map(failure => {
            const details = failure.details && Object.keys(failure.details).length
                ? ` ${JSON.stringify(failure.details)}`
                : '';
            return `- ${failure.name}: ${failure.message}${details}`;
        });
        throw new Error(`${scenario.id} validation failed; screenshot was not saved.\n${lines.join('\n')}`);
    }
    for (const check of result.checks) console.log(`PASS ${check.name}`);
}

async function evaluateScenarioChecks(page, scenario, theme, expectedUrl) {
    return page.evaluate(({ validators, allowedHosts, theme, expectedUrl }) => {
        const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
        const checks = [];

        const visible = element => {
            if (!element) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0.05
                && rect.width > 2
                && rect.height > 2;
        };
        const all = selector => [...document.querySelectorAll(selector)];
        const firstVisible = selector => all(selector).find(visible) || null;
        const visibleText = element => element?.innerText?.replace(/\s+/g, ' ').trim() || '';
        const rectSummary = element => {
            const rect = element?.getBoundingClientRect();
            return rect ? { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top), left: Math.round(rect.left) } : null;
        };
        const add = (name, ok, message, details = {}) => checks.push({ name, ok: Boolean(ok), message, details });
        const popover = () => firstVisible('.jpdb-reader-popover');
        const forbiddenPanelText = value => /translation unavailable|loading|translating|failed|error|waiting for caption lines|no examples|例文なし/i.test(value);

        const validatorsByName = {
            realPage() {
                const url = new URL(location.href);
                const bodyText = visibleText(document.body);
                add('real hostname', allowedHosts.includes(url.hostname), `Expected live hostname ${allowedHosts.join(', ')}, got ${url.hostname}`, { href: location.href });
                add('no fixture markers', !/fixture|mock data|fake data|generated image|placeholder screenshot/i.test(bodyText), 'Page contains fixture/fake/placeholder markers');
                add('no blocking consent/login dialog', !blockingDialogVisible(), 'A blocking consent/login dialog is visible');
            },
            popover() {
                const root = popover();
                const text = visibleText(root);
                const rect = rectSummary(root);
                add('Yomu popup visible', root && rect.width >= 280 && rect.height >= 180, 'Expected a visible Yomu lookup popup', { rect });
                add('Yomu popup has Japanese lookup content', root && JAPANESE_RE.test(text), 'Expected Japanese text inside the Yomu popup');
                add('Yomu popup has loaded content', root && text.length >= 20, 'Popup did not load enough visible lookup content', { text });
            },
            translation() {
                const root = popover();
                const details = root ? allIn(root, 'details[data-study-translation]').find(item => item.open && visible(item)) : null;
                const result = details?.querySelector('[data-study-translation-result]');
                const text = visibleText(result);
                add('translation section open', Boolean(details), 'Expected the Translation details section to be open');
                add('translation generated', text.length >= 6 && !/open section|translation unavailable|unavailable|translating|loading|failed|error/i.test(text), 'Expected generated translation text', { text });
            },
            grammar() {
                const root = popover();
                const details = root ? allIn(root, 'details[data-study-grammar]').find(item => item.open && visible(item)) : null;
                const hasHints = Boolean(details?.querySelector('[data-grammar-list] .jpdb-reader-study-item, .jpdb-reader-grammar-toolbar'));
                const text = visibleText(details);
                add('grammar section open', Boolean(details), 'Expected the Grammar details section to be open');
                add('grammar hints visible', hasHints && !/finding grammar|loading/i.test(text), 'Expected visible grammar hints');
            },
            immersion() {
                const root = popover();
                const details = root ? allIn(root, '[data-immersion-kit]').find(item => item.open && visible(item)) : null;
                const card = details?.querySelector('.jpdb-reader-example-card');
                const sentence = details?.querySelector('.jpdb-reader-example-sentence');
                const translation = details?.querySelector('.jpdb-reader-example-translation');
                const translationText = visibleText(translation);
                const blurred = translation?.dataset.immersionTranslationBlurred === 'true'
                    || translation?.dataset.yomuImmersionTranslationBlurred === 'true';
                add('immersion section open', Boolean(details), 'Expected the Immersion Kit details section to be open');
                add('immersion example loaded', Boolean(card && sentence && JAPANESE_RE.test(visibleText(sentence))), 'Expected a real loaded immersion example');
                add('immersion translation revealed', Boolean(translation && translationText.length >= 4 && !blurred), 'Expected a revealed example translation', { translationText, blurred });
            },
            kanji() {
                const root = popover();
                const display = root?.querySelector('.jpdb-reader-kanji-display');
                const stroke = root ? allIn(root, 'details.jpdb-reader-kanjivg').find(item => item.open && visible(item)) : null;
                const svg = stroke?.querySelector('.jpdb-reader-kanjivg-svg');
                const facts = root?.querySelector('[data-kanji-jpdb-mount] .jpdb-reader-kanji-facts, .jpdb-reader-kanji-facts, .jpdb-reader-kanji-readings');
                const text = visibleText(root);
                add('kanji drilldown visible', Boolean(display && visible(display)), 'Expected a kanji drilldown popup');
                add('kanji stroke section open', Boolean(stroke && svg), 'Expected open stroke/KanjiVG section with SVG');
                add('kanji facts loaded', Boolean(facts && !/loading|unavailable/i.test(text)), 'Expected loaded kanji facts/readings');
            },
            settingsDictionaries() {
                const settings = firstVisible('.jpdb-reader-settings');
                const panel = settings?.querySelector('fieldset[data-settings-panel="dictionaries"]:not([hidden])');
                const importedRows = panel ? allIn(panel, '.jpdb-reader-dictionary-row[data-dictionary-source-row]')
                    .filter(row => {
                        const id = row.getAttribute('data-source-id') || '';
                        return !['__jpdb__', '__study_translation__', '__study_grammar__', '__immersion_kit__'].includes(id);
                    }) : [];
                const text = visibleText(panel);
                add('settings dictionaries panel visible', Boolean(settings && panel && visible(panel)), 'Expected Yomu settings on Dictionaries');
                add('real imported dictionary rows visible', importedRows.length > 0 && !/import yomitan dictionaries/i.test(text), 'Expected at least one real imported dictionary row', { importedRows: importedRows.map(row => row.getAttribute('data-source-id')) });
            },
            settingsImages() {
                const settings = firstVisible('.jpdb-reader-settings');
                const panel = settings?.querySelector('fieldset[data-settings-panel="media"]:not([hidden])');
                add('settings media panel visible', Boolean(settings && panel && visible(panel)), 'Expected Yomu settings on Media');
                add('OCR controls visible', Boolean(panel?.querySelector('[name="ocrProvider"], [name="ocrShowTextOverlay"], [name="ocrAutoScanImages"]')), 'Expected OCR settings controls');
            },
            settingsHelp() {
                const settings = firstVisible('.jpdb-reader-settings');
                const panel = settings?.querySelector('fieldset[data-settings-panel="help"]:not([hidden])');
                const text = visibleText(panel);
                add('settings help panel visible', Boolean(settings && panel && visible(panel)), 'Expected Yomu settings on Help');
                add('real help controls visible', /GitHub|Discord|Reset|Support|Docs/i.test(text), 'Expected real help/support controls', { text });
            },
            youtubeVideo() {
                const url = new URL(location.href);
                const expected = expectedYouTubeVideoId(expectedUrl);
                const current = url.searchParams.get('v')
                    || document.querySelector('ytd-watch-flexy')?.getAttribute('video-id')
                    || document.querySelector('#movie_player')?.getAttribute('data-video-id')
                    || '';
                const video = firstVisible('video');
                const watch = Boolean(document.querySelector('ytd-watch-flexy, #movie_player'));
                const player = document.querySelector('#movie_player');
                const adShowing = Boolean(player?.classList.contains('ad-showing') || document.querySelector('.ytp-ad-player-overlay, .ytp-ad-preview-container'));
                const visibleAds = visibleYouTubeAds();
                const duration = video instanceof HTMLVideoElement ? video.duration : Number.NaN;
                add('YouTube URL is a watch video', url.pathname === '/watch' && Boolean(current), 'Expected a youtube.com/watch URL with a video id, not Shorts/search/channel UI', { href: location.href, current });
                add('YouTube target video id matches', !expected || current === expected, 'Expected the configured YouTube target video id', { expected, current, href: location.href });
                add('YouTube watch page visible', watch, 'Expected real YouTube watch page UI');
                add('YouTube video surface visible', Boolean(video && video.getBoundingClientRect().width >= 320), 'Expected visible YouTube video surface', { rect: rectSummary(video) });
                add('YouTube target video playing', !adShowing && (!Number.isFinite(duration) || duration > 60), 'Expected the target video, not an ad or preview segment', { adShowing, duration: Number.isFinite(duration) ? Math.round(duration) : null });
                add('no visible YouTube ads', !adShowing && visibleAds.length === 0, 'Expected no player, companion, display, or sponsored ad units in frame', { visibleAds });
            },
            cijAvailable() {
                const text = visibleText(document.body);
                const video = firstVisible('video, iframe[src*="vimeo"], iframe[src*="youtube"]');
                add('CIJ member content available', !/content restricted to members only|restricted to members only/i.test(text), 'CIJ content is unavailable; log in with a real member/test account');
                add('CIJ video surface visible', Boolean(video && video.getBoundingClientRect().width >= 320), 'Expected visible CIJ video surface', { rect: rectSummary(video) });
            },
            videoTranscript() {
                const player = firstVisible('.jpdb-subtitle-player');
                const panel = firstVisible('.jpdb-subtitle-list:not([hidden])');
                const video = firstVisible('video, #movie_player');
                const overlay = firstVisible('.jpdb-subtitle-primary');
                const nativeCaption = firstVisible('.ytp-caption-segment, .caption-window');
                const rows = panel ? allIn(panel, '.jpdb-subtitle-list-row') : [];
                const active = panel ? allIn(panel, '.jpdb-subtitle-list-row.active').find(visible) : null;
                const scroller = panel?.querySelector('.jpdb-subtitle-list-scroll');
                const overlayWords = overlay ? allIn(overlay, '.jpdb-reader-word').filter(visible) : [];
                const rowWords = panel ? allIn(panel, '.jpdb-subtitle-row-text .jpdb-reader-word').filter(visible) : [];
                const coloredWords = [...overlayWords, ...rowWords].filter(readerWordHasVisibleColorSignal);
                const panelText = visibleText(panel);
                const playerText = `${visibleText(overlay)} ${visibleText(nativeCaption)}`.trim();
                add('Yomu subtitle player visible', Boolean(player), 'Expected Yomu subtitle player controls');
                add('Yomu transcript side panel open', Boolean(panel && panel.getBoundingClientRect().width >= 260), 'Expected open Yomu transcript panel', { rect: rectSummary(panel) });
                add('real video visible', Boolean(video && video.getBoundingClientRect().width >= 320), 'Expected visible real video surface', { rect: rectSummary(video) });
                add('Japanese transcript rows visible', rows.length > 0 && JAPANESE_RE.test(panelText), 'Expected Japanese transcript rows', { rows: rows.length });
                add('active transcript row visible', Boolean(active), 'Expected a current active transcript row');
                add('active transcript row framed', Boolean(active && rowFullyInsideScroller(active, scroller)), 'Expected the active transcript row to be fully visible inside the scroll frame', { active: rectSummary(active), scroller: rectSummary(scroller) });
                add('subtitle text visible on player', JAPANESE_RE.test(playerText), 'Expected Japanese subtitle text on the video player', { playerText });
                add('transcript loaded', !/waiting for caption lines|captions are available|no subtitles|loading/i.test(panelText), 'Transcript panel is still waiting/loading', { panelText });
                add('parsed subtitle words visible', overlayWords.length > 0 && rowWords.length > 0, 'Expected parsed .jpdb-reader-word spans in the overlay and transcript. Set YOMU_CAPTURE_API_KEY, YOMU_TEST_API_KEY, or YOMU_PROFILE_API_KEY in .env, or use a capture profile with imported dictionaries.', { overlayWords: overlayWords.length, rowWords: rowWords.length });
                add('subtitle word color signals visible', coloredWords.length > 0, 'Expected JPDB status or pitch color styling on parsed subtitle words', { coloredWords: coloredWords.length });
            },
            ocr() {
                const images = all('img').filter(image => visible(image)
                    && image.naturalWidth >= 200
                    && image.naturalHeight >= 200
                    && /^https:\/\//i.test(image.currentSrc || image.src));
                const layer = firstVisible('.jpdb-ocr-layer');
                const lines = layer ? allIn(layer, '.jpdb-ocr-line').filter(visible) : [];
                const active = lines.find(line => line.classList.contains('jpdb-ocr-line-active') || line.dataset.pinned === 'true');
                const popup = popover();
                const text = lines.map(line => visibleText(line)).join(' ');
                add('real image content visible', images.length > 0, 'Expected visible real https image content', { images: images.slice(0, 4).map(image => image.currentSrc || image.src) });
                add('OCR overlay visible', Boolean(layer), 'Expected Yomu OCR overlay');
                add('OCR Japanese text visible', lines.length > 0 && JAPANESE_RE.test(text), 'Expected recognized Japanese OCR text', { lines: lines.length, text });
                add('OCR line or popup active', Boolean(active || popup), 'Expected an active/pinned OCR line or lookup popup from OCR text');
            },
            newtab() {
                const root = firstVisible('[data-jpdb-reader-root].jpdb-reader-newtab');
                const study = root?.querySelector('[data-newtab-study]');
                const prompt = root?.querySelector('[data-newtab-prompt]');
                const answer = root?.querySelector('[data-newtab-answer]');
                const count = root?.querySelector('[data-newtab-count]');
                const promptText = visibleText(prompt);
                const answerText = visibleText(answer);
                const countText = visibleText(count);
                const revealed = root?.classList.contains('jpdb-reader-newtab-revealed') || answerText.length > 2;
                add('Yomu new-tab visible', Boolean(root && study && visible(study)), 'Expected Yomu new-tab study UI');
                add('real study card visible', JAPANESE_RE.test(promptText) && !/^0\s*\/\s*0$/.test(countText), 'Expected a real study card', { promptText, countText });
                add('answer/details revealed', revealed, 'Expected the card answer/details to be revealed', { answerText });
            },
        };

        for (const validator of validators) {
            validatorsByName[validator]?.();
        }
        validateTheme();
        return { checks };

        function allIn(root, selector) {
            return [...root.querySelectorAll(selector)];
        }

        function blockingDialogVisible() {
            return all('[role="dialog"], dialog, tp-yt-paper-dialog, ytd-consent-bump-v2-lightbox')
                .some(element => visible(element)
                    && /before you continue|cookies and data|sign in to confirm|consent|restricted/i.test(visibleText(element)));
        }

        function validateTheme() {
            if (theme === 'auto') return;
            const root = document.documentElement;
            const surface = firstVisible('.jpdb-reader-popover, .jpdb-reader-settings, .jpdb-subtitle-list, [data-jpdb-reader-root]');
            const className = `jpdb-reader-theme-${theme}`;
            add('Yomu capture theme applied', root.classList.contains(className), `Expected ${className} on the page root`, { className: root.className });
            if (theme !== 'dark' || !surface) return;
            const background = getComputedStyle(surface).backgroundColor;
            add('Yomu dark surface visible', backgroundLuminance(background) < 130, 'Expected the visible Yomu surface to be dark', { background });
        }

        function backgroundLuminance(value) {
            const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (!match) return 255;
            const [, red, green, blue] = match.map(Number);
            return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
        }

        function readerWordHasVisibleColorSignal(word) {
            const className = word.className || '';
            const hasStatusClass = /\bjpdb-(new|learning|known|due|failed|not-in-deck|never-forget|redundant|suspended)\b/.test(className);
            const hasPitchClass = /\bjpdb-pitch-(heiban|atamadaka|nakadaka|odaka|kifuku)\b/.test(className);
            if (!hasStatusClass && !hasPitchClass) return false;
            const style = getComputedStyle(word);
            const parentStyle = word.parentElement ? getComputedStyle(word.parentElement) : null;
            return hasVisibleBackground(style.backgroundColor)
                || hasVisibleUnderline(style)
                || Boolean(parentStyle && normalizedColor(style.color) !== normalizedColor(parentStyle.color));
        }

        function hasVisibleBackground(value) {
            return !isTransparentColor(value);
        }

        function hasVisibleUnderline(style) {
            return style.textDecorationLine.includes('underline') && !isTransparentColor(style.textDecorationColor);
        }

        function isTransparentColor(value) {
            return !value
                || value === 'transparent'
                || /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(value)
                || /rgba?\([^)]*,\s*0\s*\)/i.test(value);
        }

        function normalizedColor(value) {
            return value.replace(/\s+/g, '').toLowerCase();
        }

        function expectedYouTubeVideoId(value) {
            try {
                const url = new URL(value);
                return url.hostname.includes('youtube.com') ? url.searchParams.get('v') || '' : '';
            } catch {
                return '';
            }
        }

        function visibleYouTubeAds() {
            const selectors = [
                '.ytp-ad-player-overlay',
                '.ytp-ad-preview-container',
                '.ytp-ad-overlay-container:not(:empty)',
                '.video-ads:not(:empty)',
                'ytd-ad-slot-renderer',
                'ytd-companion-slot-renderer',
                'ytd-display-ad-renderer',
                'ytd-in-feed-ad-layout-renderer',
                'ytd-player-legacy-desktop-watch-ads-renderer',
                'ytd-promoted-sparkles-web-renderer',
            ].join(',');
            return all(selectors)
                .filter(visible)
                .map(element => {
                    const text = visibleText(element).slice(0, 80);
                    return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).trim().replace(/\s+/g, '.')}` : ''}${text ? `:${text}` : ''}`;
                })
                .slice(0, 6);
        }

        function rowFullyInsideScroller(row, scroller) {
            if (!row || !scroller) return false;
            const rowRect = row.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            return rowRect.top >= scrollerRect.top + 2
                && rowRect.bottom <= scrollerRect.bottom - 2
                && rowRect.left >= scrollerRect.left
                && rowRect.right <= scrollerRect.right;
        }
    }, { validators: scenario.validators, allowedHosts: scenario.hosts, theme, expectedUrl });
}

await main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
