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
const VIDEO_TRANSCRIPT_VALIDATOR = 'videoTranscript';
const LOOKUP_VALIDATORS = new Set(['popover', 'translation', 'grammar', 'immersion', 'kanji']);
const SETTINGS_PANEL_BY_VALIDATOR = new Map([
    ['settingsDictionaries', 'dictionaries'],
    ['settingsImages', 'media'],
    ['settingsHelp', 'help'],
]);
const VIDEO_TIME_PARAMS = ['t', 'start'];
const HTTP_URL_PROTOCOLS = new Set(['https:', 'http:']);
const LIVE_URL_VALIDATORS = [
    validateHttpUrlProtocol,
    validateHttpsUrlProtocol,
    validateNonLocalUrlHost,
    validateAllowedUrlHost,
];

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

const ARG_HANDLERS = new Map([
    ['--help', showHelp],
    ['-h', showHelp],
    ['--list', setList],
    ['--auto', setAuto],
    ['--headless', setHeadless],
    ['--theme', setTheme],
    ['--no-inject', setNoInject],
    ['--scenario', addScenarios],
    ['--only', addScenarios],
    ['--group', setGroup],
    ['--profile', setProfile],
    ['--userscript', setUserscript],
    ['--out-dir', setOutDir],
    ['--timeout-ms', setTimeoutMs],
    ['--url', addUrlOverride],
]);

function parseArgs(argv) {
    const args = defaultCaptureArgs();
    applyArgs(args, argv);
    validateArgs(args);
    return args;
}

function applyArgs(args, argv) {
    for (let index = 0; index < argv.length; index += 1) {
        index += applyArg(args, argv, index);
    }
}

function defaultCaptureArgs() {
    return {
        auto: false,
        group: '',
        headless: false,
        list: false,
        noInject: false,
        outDir: '',
        profile: envOrDefault('YOMU_CAPTURE_PROFILE', DEFAULT_PROFILE),
        scenarioIds: [],
        theme: envOrDefault('YOMU_CAPTURE_THEME', DEFAULT_CAPTURE_THEME),
        timeoutMs: Number(envOrDefault('YOMU_CAPTURE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)),
        urlOverrides: new Map(),
        userscript: envOrDefault('YOMU_CAPTURE_USERSCRIPT', DEFAULT_USERSCRIPT),
    };
}

function envOrDefault(name, fallback) {
    const value = process.env[name];
    return value ? value : fallback;
}

function applyArg(args, argv, index) {
    const arg = argv[index];
    const handler = ARG_HANDLERS.get(arg);
    if (!handler) throw new Error(`Unknown option: ${arg}`);
    return handler(args, argv, index, arg);
}

function showHelp() {
    console.log(usage());
    process.exit(0);
}

function setList(args) {
    args.list = true;
    return 0;
}

function setAuto(args) {
    args.auto = true;
    return 0;
}

function setHeadless(args) {
    args.headless = true;
    return 0;
}

function setNoInject(args) {
    args.noInject = true;
    return 0;
}

function setTheme(args, argv, index, arg) {
    args.theme = readValue(argv, index + 1, arg);
    return 1;
}

function addScenarios(args, argv, index, arg) {
    args.scenarioIds.push(...readValue(argv, index + 1, arg).split(',').map(value => value.trim()).filter(Boolean));
    return 1;
}

function setGroup(args, argv, index, arg) {
    args.group = readValue(argv, index + 1, arg);
    return 1;
}

function setProfile(args, argv, index, arg) {
    args.profile = readValue(argv, index + 1, arg);
    return 1;
}

function setUserscript(args, argv, index, arg) {
    args.userscript = readValue(argv, index + 1, arg);
    return 1;
}

function setOutDir(args, argv, index, arg) {
    args.outDir = readValue(argv, index + 1, arg);
    return 1;
}

function setTimeoutMs(args, argv, index, arg) {
    args.timeoutMs = Number(readValue(argv, index + 1, arg));
    return 1;
}

function addUrlOverride(args, argv, index, arg) {
    const value = readValue(argv, index + 1, arg);
    const separator = value.indexOf('=');
    if (separator < 1) throw new Error(`Expected --url <scenario=url>, received ${value}`);
    args.urlOverrides.set(value.slice(0, separator), value.slice(separator + 1));
    return 1;
}

function validateArgs(args) {
    if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
        throw new Error(`Invalid --timeout-ms value: ${args.timeoutMs}`);
    }
    if (!['dark', 'light', 'auto'].includes(args.theme)) {
        throw new Error(`Invalid --theme value: ${args.theme}`);
    }
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
    await runCapture(args);
}

async function runCapture(args) {
    const selected = selectedScenarios(args);
    await assertCapturePreconditions(args, selected);
    const rl = capturePrompt(args);
    const context = await openCaptureContext(args);

    try {
        await captureSelectedScenarios(context, selected, args, rl);
    } finally {
        await context.close();
        rl?.close();
    }
}

async function assertCapturePreconditions(args, selected) {
    requireSelectedScenarios(selected);
    if (shouldAssertUserscriptReadable(args, selected)) {
        await assertReadableFile(args.userscript, `Userscript not found: ${args.userscript}. Run npm run build or pass --userscript.`);
    }
    requireOperatorTty(args);
}

function requireSelectedScenarios(selected) {
    if (selected.length) return;
    console.log(usage());
    throw new Error('Choose at least one --scenario or --group.');
}

function requireOperatorTty(args) {
    if (args.auto || process.stdin.isTTY) return;
    throw new Error('Operator capture requires a TTY. Use --auto only when the page state is already scripted externally.');
}

function shouldAssertUserscriptReadable(args, selected) {
    return !args.noInject && selected.some(scenarioUsesInjectedUserscript);
}

function scenarioUsesInjectedUserscript(scenario) {
    return scenario.inject !== false;
}

function capturePrompt(args) {
    return args.auto ? null : createInterface({ input: process.stdin, output: process.stdout });
}

async function openCaptureContext(args) {
    const context = await chromium.launchPersistentContext(path.resolve(args.profile), {
        headless: args.headless,
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
    });
    await installCaptureUserscriptBridge(context);
    await installCaptureSettingsSeed(context, args.theme);
    return context;
}

async function captureSelectedScenarios(context, selected, args, rl) {
    for (const scenario of selected) {
        await captureScenario(context, scenario, args, rl);
    }
}

async function captureScenario(context, scenario, args, rl) {
    const capture = captureScenarioRun(scenario, args);
    const page = await context.newPage();

    try {
        await setupCapturePage(context, page, scenario, args, capture);
        await prepareCapturePage(page, scenario, args, capture);
        await maybePromptForCapture(args, scenario, rl);
        await validateAndSaveCapture(page, scenario, args, capture);
    } finally {
        await page.close();
    }
}

function captureScenarioRun(scenario, args) {
    const url = scenarioUrl(scenario, args);
    assertLiveUrl(url, scenario.hosts, scenario.id);
    return {
        url,
        outputPath: screenshotPath(scenario, args),
        needsVideoTranscript: hasScenarioValidator(scenario, VIDEO_TRANSCRIPT_VALIDATOR),
    };
}

async function setupCapturePage(context, page, scenario, args, capture) {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({ colorScheme: captureColorScheme(args.theme) });
    if (scenario.youtubeConsent) await installYouTubeConsentCookies(context);
    logCaptureScenarioStart(scenario, capture);
    await page.goto(capture.url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
    await waitForStablePage(page);
}

function captureColorScheme(theme) {
    return theme === 'light' ? 'light' : 'dark';
}

function logCaptureScenarioStart(scenario, capture) {
    console.log(`\n== ${scenario.id} ==`);
    console.log(`URL: ${capture.url}`);
    console.log(`Viewport: ${scenario.viewport.width}x${scenario.viewport.height}`);
    console.log(`Output: ${capture.outputPath}`);
}

async function prepareCapturePage(page, scenario, args, capture) {
    if (!args.noInject && scenarioUsesInjectedUserscript(scenario)) await injectUserscript(page, args.userscript);
    await dismissKnownConsentDialogs(page);
    await prepareYomuScenario(page, scenario);
    if (capture.needsVideoTranscript) await prepareVideoTranscriptScenario(page, capture.url);
}

async function maybePromptForCapture(args, scenario, rl) {
    if (args.auto) return;
    console.log('\nPrepare the page state:');
    for (const instruction of scenario.instructions) console.log(`  - ${instruction}`);
    await rl.question('\nPress Enter to validate and save this real screenshot, or Ctrl-C to abort. ');
}

async function validateAndSaveCapture(page, scenario, args, capture) {
    if (capture.needsVideoTranscript) await centerActiveTranscriptRow(page);
    await validateScenario(page, scenario, args.timeoutMs, args.theme, capture.url);
    if (capture.needsVideoTranscript) await settleVideoScreenshotFrame(page);
    await mkdir(path.dirname(capture.outputPath), { recursive: true });
    await page.screenshot({ path: capture.outputPath, fullPage: false, animations: 'disabled' });
    console.log(`Saved ${capture.outputPath}`);
}

async function prepareYomuScenario(page, scenario) {
    for (const prepare of scenarioPreparers(scenario)) {
        await prepare(page);
    }
}

function hasScenarioValidator(scenario, validator) {
    return scenario.validators.includes(validator);
}

function scenarioPreparers(scenario) {
    return [
        lookupScenarioPreparer(scenario),
        ...settingsScenarioPreparers(scenario),
        newTabScenarioPreparer(scenario),
    ].filter(Boolean);
}

function lookupScenarioPreparer(scenario) {
    return scenario.validators.some(validator => LOOKUP_VALIDATORS.has(validator))
        ? page => prepareLookupScenario(page, scenario.validators)
        : null;
}

function settingsScenarioPreparers(scenario) {
    return [...SETTINGS_PANEL_BY_VALIDATOR]
        .filter(([validator]) => scenario.validators.includes(validator))
        .map(([, panel]) => page => prepareSettingsScenario(page, panel));
}

function newTabScenarioPreparer(scenario) {
    return hasScenarioValidator(scenario, 'newtab') ? prepareNewTabScenario : null;
}

async function prepareLookupScenario(page, validators) {
    await page.waitForSelector('.jpdb-reader-word', { timeout: 20_000 }).catch(() => undefined);
    await clickLookupTarget(page);
    await openRequestedLookupDetails(page, validators);
    await maybeOpenKanjiLookup(page, validators);
    await page.waitForTimeout(12_000);
    await maybeScrollLookupStudyDetails(page, validators);
}

async function clickLookupTarget(page) {
    const target = await page.evaluate(() => {
        return lookupTargetCenter();

        function lookupTargetCenter() {
            const preferred = preferredLookupWord();
            return preferred ? elementCenter(preferred) : null;
        }

        function preferredLookupWord() {
            const words = lookupWords();
            return words.find(isPreferredLookupWord) || words[0] || null;
        }

        function lookupWords() {
            return [...document.querySelectorAll('.jpdb-reader-word')].filter(isVisibleJapaneseLookupWord);
        }

        function isVisibleJapaneseLookupWord(element) {
            return hasJapaneseText(element) && isLookupRectVisible(element) && isElementStyleVisible(element);
        }

        function hasJapaneseText(element) {
            return /[\u3040-\u30ff\u3400-\u9fff]/u.test(element.textContent || '');
        }

        function isLookupRectVisible(element) {
            const rect = element.getBoundingClientRect();
            return [
                rect.width > 8,
                rect.height > 8,
                rect.top >= 80,
                rect.bottom <= innerHeight - 24,
            ].every(Boolean);
        }

        function isElementStyleVisible(element) {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
        }

        function isPreferredLookupWord(element) {
            const text = element.textContent || '';
            return /日本語|日本|言語/.test(text) || ['本', '語'].every(fragment => text.includes(fragment));
        }

        function elementCenter(element) {
            const rect = element.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
    });
    if (target) await page.mouse.click(target.x, target.y);
}

async function openRequestedLookupDetails(page, validators) {
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
}

async function maybeOpenKanjiLookup(page, validators) {
    if (!validators.includes('kanji')) return;
    await page.locator('.jpdb-reader-popover [data-action="kanji"][data-kanji]').first().click({ timeout: 8000 }).catch(() => undefined);
    await page.waitForSelector('.jpdb-reader-kanji-display', { timeout: 15_000 }).catch(() => undefined);
    await page.evaluate(() => {
        const details = document.querySelector('.jpdb-reader-popover details.jpdb-reader-kanjivg');
        if (details instanceof HTMLDetailsElement && !details.open) details.querySelector('summary')?.click();
    });
}

async function maybeScrollLookupStudyDetails(page, validators) {
    if (!validators.some(validator => ['translation', 'grammar'].includes(validator))) return;
    await page.evaluate(() => {
        const body = document.querySelector('.jpdb-reader-popover-body');
        const target = document.querySelector('details[data-study-translation], details[data-study-grammar]');
        if (body instanceof HTMLElement && target instanceof HTMLElement) {
            body.scrollTop = Math.max(0, target.offsetTop - body.clientHeight * 0.16);
        }
    });
    await page.waitForTimeout(300);
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
        const bodySerializers = [
            { matches: data => data instanceof ArrayBuffer, serialize: serializeArrayBufferBody },
            { matches: data => ArrayBuffer.isView(data), serialize: serializeArrayBufferViewBody },
            { matches: data => data instanceof FormData, serialize: serializeFormDataBody },
        ];
        const serializeBody = async data => {
            const serializer = bodySerializers.find(candidate => candidate.matches(data))?.serialize;
            return serializer ? serializer(data) : data;
        };
        window.GM_getValue = (key, fallback) => readStoredValue(key, fallback);
        window.GM_setValue = (key, value) => { writeStoredValue(key, value); };
        window.GM_deleteValue = removeStoredValue;
        window.GM_listValues = () => [...storedValueNames()];
        window.GM_addStyle = css => {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement || document.body).append(style);
            return style;
        };
        window.GM_registerMenuCommand = () => undefined;
        window.GM_xmlhttpRequest = options => {
            const request = gmRequestState(options);
            Promise.resolve(serializeBody(options.data))
                .then(data => window.__yomuCaptureRequest(gmRequestPayload(options, data)))
                .then(result => settleGmResponse(request, options, result))
                .catch(error => settleGmRequest(request, options.onerror, error));
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

        function serializeArrayBufferBody(data) {
            return serializeBytes(new Uint8Array(data));
        }

        function serializeArrayBufferViewBody(data) {
            return serializeBytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        }

        async function serializeFormDataBody(data) {
            const entries = [];
            for (const entry of data.entries()) entries.push(await serializeFormDataEntry(entry));
            return { kind: 'formdata', entries };
        }

        async function serializeFormDataEntry([name, value]) {
            return value instanceof Blob
                ? { name, blob: await serializeBlobField(value) }
                : { name, value: String(value) };
        }

        async function serializeBlobField(value) {
            return {
                bytes: [...new Uint8Array(await value.arrayBuffer())],
                type: value.type,
                filename: value.name || 'file',
            };
        }

        function serializeBytes(bytes) {
            return { kind: 'arraybuffer', bytes: [...bytes] };
        }

        function removeStoredValue(key) {
            memoryStore.delete(key);
            ignoreStorageError(() => localStorage.removeItem(storageKey(key)));
        }

        function storedValueNames() {
            const keys = new Set(memoryStore.keys());
            ignoreStorageError(() => addLocalStorageValueNames(keys));
            return keys;
        }

        function addLocalStorageValueNames(keys) {
            for (let index = 0; index < localStorage.length; index += 1) {
                addStorageKeyName(keys, localStorage.key(index));
            }
        }

        function addStorageKeyName(keys, key) {
            if (key?.startsWith(storagePrefix)) keys.add(key.slice(storagePrefix.length));
        }

        function ignoreStorageError(action) {
            try {
                return action();
            } catch {
                return undefined;
            }
        }

        function gmRequestState(options) {
            const request = { settled: false, timer: 0 };
            const timeoutMs = Number(options.timeout) || 0;
            if (timeoutMs > 0) {
                request.timer = window.setTimeout(() => {
                    settleGmRequest(request, options.ontimeout, { status: 0, response: null, responseText: '' });
                }, timeoutMs);
            }
            return request;
        }

        function gmRequestPayload(options, data) {
            return {
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data,
            };
        }

        function settleGmRequest(request, callback, value) {
            if (request.settled) return;
            request.settled = true;
            if (request.timer) window.clearTimeout(request.timer);
            callback?.(value);
        }

        function settleGmResponse(request, options, result) {
            if (request.settled) return;
            settleGmRequest(request, options.onload, gmResponse(options, result));
        }

        function gmResponse(options, result) {
            return {
                status: result.status,
                response: gmResponseBody(options.responseType, result),
                responseText: result.responseText,
            };
        }

        function gmResponseBody(responseType, result) {
            const bytes = new Uint8Array(result.bytes);
            const responseParsers = {
                arraybuffer: () => bytes.buffer,
                blob: () => new Blob([bytes], { type: result.contentType }),
                json: () => JSON.parse(result.responseText || 'null'),
                text: () => result.responseText,
            };
            return (responseParsers[responseType] || responseParsers.text)();
        }
    });
}

function decodeCaptureRequestBody(data) {
    if (!isCaptureRequestBodyRecord(data)) return data;
    return CAPTURE_REQUEST_BODY_DECODERS[data.kind]?.(data) ?? data;
}

const CAPTURE_REQUEST_BODY_DECODERS = {
    arraybuffer: data => Buffer.from(data.bytes ?? []),
    formdata: decodeCaptureFormDataBody,
};

function isCaptureRequestBodyRecord(data) {
    return Boolean(data && typeof data === 'object');
}

function decodeCaptureFormDataBody(data) {
    const formData = new FormData();
    for (const entry of data.entries ?? []) appendCaptureFormDataEntry(formData, entry);
    return formData;
}

function appendCaptureFormDataEntry(formData, entry) {
    if (!entry.blob) {
        formData.append(entry.name, entry.value ?? '');
        return;
    }
    formData.append(entry.name, captureFormDataBlob(entry.blob), entry.blob.filename || 'file');
}

function captureFormDataBlob(blob) {
    return new Blob([Buffer.from(blob.bytes ?? [])], { type: blob.type || 'application/octet-stream' });
}

async function installCaptureSettingsSeed(context, theme) {
    await context.addInitScript(({ key, settings }) => {
        const gmKey = `__yomu_capture_gm__${key}`;
        seedStoredSettings(key);
        seedStoredSettings(gmKey);

        function seedStoredSettings(storageKey) {
            try {
                localStorage.setItem(storageKey, JSON.stringify({ ...storedSettings(storageKey), ...settings }));
            } catch {
                localStorage.setItem(storageKey, JSON.stringify(settings));
            }
        }

        function storedSettings(storageKey) {
            const stored = localStorage.getItem(storageKey);
            const parsed = stored ? JSON.parse(stored) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
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
    const message = liveUrlValidationError(url, allowedHosts, scenarioId);
    if (message) throw new Error(message);
}

function liveUrlValidationError(url, allowedHosts, scenarioId) {
    for (const validate of LIVE_URL_VALIDATORS) {
        const message = validate(url, allowedHosts, scenarioId);
        if (message) return message;
    }
    return '';
}

function validateHttpUrlProtocol(url, allowedHosts, scenarioId) {
    return HTTP_URL_PROTOCOLS.has(url.protocol)
        ? ''
        : `${scenarioId}: only http(s) live pages are allowed, got ${url.protocol}`;
}

function validateHttpsUrlProtocol(url, allowedHosts, scenarioId) {
    return url.protocol === 'https:'
        ? ''
        : `${scenarioId}: screenshots must use https live pages, got ${url.href}`;
}

function validateNonLocalUrlHost(url, allowedHosts, scenarioId) {
    return localUrlHost(url.hostname)
        ? `${scenarioId}: local/fixture hosts are not allowed (${url.hostname})`
        : '';
}

function localUrlHost(hostname) {
    return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.local');
}

function validateAllowedUrlHost(url, allowedHosts, scenarioId) {
    return allowedHosts.includes(url.hostname)
        ? ''
        : `${scenarioId}: expected one of ${allowedHosts.join(', ')}, got ${url.hostname}`;
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
    if (await clickKnownConsentDialog(page)) return;
    if (await clickFallbackConsentButton(page)) await page.waitForTimeout(5000);
}

async function clickKnownConsentDialog(page) {
    for (const label of [/Reject all/i, /Accept all/i, /I agree/i, /Got it/i, /閉じる/, /同意/]) {
        if (await clickConsentRoleButton(page, label)) return true;
    }
    return false;
}

async function clickConsentRoleButton(page, label) {
    const button = page.getByRole('button', { name: label }).first();
    if (!await button.count()) return false;
    try {
        await button.click({ timeout: 1800 });
        await page.waitForTimeout(5000);
        return true;
    } catch {
        // Keep trying known consent labels; validation will fail if an overlay remains.
        return false;
    }
}

async function clickFallbackConsentButton(page) {
    const button = page.locator('button, [role="button"], tp-yt-paper-button, ytd-button-renderer')
        .filter({ hasText: /^(Reject all|Accept all|I agree|Got it|閉じる|同意)$/i })
        .first();
    const visible = await button.isVisible().catch(() => false);
    if (!visible) return false;
    await button.click({ timeout: 1800 });
    return true;
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
        enableYouTubeTheaterMode();
        const video = document.querySelector('video');
        if (!(video instanceof HTMLVideoElement)) return;
        video.muted = true;
        if (shouldSeekVideo(video, targetSeconds)) video.currentTime = targetSeconds;
        await video.play().catch(() => undefined);

        function enableYouTubeTheaterMode() {
            if (!location.hostname.includes('youtube.com')) return;
            const watch = document.querySelector('ytd-watch-flexy');
            const theaterButton = document.querySelector('.ytp-size-button');
            if (shouldClickYouTubeTheaterButton(watch, theaterButton)) theaterButton.click();
        }

        function shouldClickYouTubeTheaterButton(watch, theaterButton) {
            return Boolean(watch && theaterButton instanceof HTMLElement && !watch.hasAttribute('theater'));
        }

        function shouldSeekVideo(video, seconds) {
            return Number.isFinite(seconds) && Math.abs(video.currentTime - seconds) > 2;
        }
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
    return parseVideoStartParam(videoStartParam(parsed));
}

function videoStartParam(url) {
    for (const name of VIDEO_TIME_PARAMS) {
        const value = url.searchParams.get(name);
        if (value) return value;
    }
    return '';
}

function parseVideoStartParam(raw) {
    if (!raw) return Number.NaN;
    return parseClockVideoStart(raw) ?? parseNumericVideoStart(raw);
}

function parseClockVideoStart(raw) {
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
    if (!match) return null;
    const parts = videoStartParts(match);
    if (!parts.some(Boolean)) return null;
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function videoStartParts(match) {
    return [match[1], match[2], match[3]].map(value => Number(value || 0));
}

function parseNumericVideoStart(raw) {
    const number = Number(raw.replace(/s$/i, ''));
    return Number.isFinite(number) ? number : Number.NaN;
}

async function validateScenario(page, scenario, timeoutMs, theme, expectedUrl) {
    await page.waitForFunction(() => document.body && document.body.innerText.length > 0, null, { timeout: timeoutMs });
    assertLiveUrl(page.url(), scenario.hosts, scenario.id);
    const result = await waitForScenarioChecks(page, scenario, timeoutMs, theme, expectedUrl);
    assertScenarioChecksPassed(scenario, result);
    logPassedScenarioChecks(result);
}

async function waitForScenarioChecks(page, scenario, timeoutMs, theme, expectedUrl) {
    const deadline = Date.now() + timeoutMs;
    let result;
    do {
        result = await evaluateScenarioChecks(page, scenario, theme, expectedUrl);
        if (!result.checks.some(check => !check.ok)) break;
        await page.waitForTimeout(1000);
    } while (Date.now() < deadline);
    return result;
}

function assertScenarioChecksPassed(scenario, result) {
    const failures = result.checks.filter(check => !check.ok);
    if (failures.length) throw new Error(`${scenario.id} validation failed; screenshot was not saved.\n${failures.map(formatScenarioFailure).join('\n')}`);
}

function formatScenarioFailure(failure) {
    return `- ${failure.name}: ${failure.message}${failureDetailsText(failure)}`;
}

function failureDetailsText(failure) {
    return failure.details && Object.keys(failure.details).length
        ? ` ${JSON.stringify(failure.details)}`
        : '';
}

function logPassedScenarioChecks(result) {
    for (const check of result.checks) console.log(`PASS ${check.name}`);
}

async function evaluateScenarioChecks(page, scenario, theme, expectedUrl) {
    return page.evaluate(({ validators, allowedHosts, theme, expectedUrl }) => {
        const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
        const BUILT_IN_DICTIONARY_SOURCE_IDS = new Set(['__jpdb__', '__study_translation__', '__study_grammar__', '__immersion_kit__']);
        const checks = [];

        const visible = element => Boolean(element && styleVisible(getComputedStyle(element)) && rectVisible(element.getBoundingClientRect()));
        const all = selector => [...document.querySelectorAll(selector)];
        const firstVisible = selector => all(selector).find(visible) || null;
        const visibleText = element => element?.innerText?.replace(/\s+/g, ' ').trim() || '';
        const rectSummary = element => {
            const rect = element?.getBoundingClientRect();
            return rect ? { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top), left: Math.round(rect.left) } : null;
        };
        const add = (name, ok, message, details = {}) => checks.push({ name, ok: Boolean(ok), message, details });
        const popover = () => firstVisible('.jpdb-reader-popover');

        const validatorsByName = {
            realPage() {
                const url = new URL(location.href);
                const bodyText = visibleText(document.body);
                add('real hostname', allowedHosts.includes(url.hostname), `Expected live hostname ${allowedHosts.join(', ')}, got ${url.hostname}`, { href: location.href });
                add('no fixture markers', !/fixture|mock data|fake data|generated image|placeholder screenshot/i.test(bodyText), 'Page contains fixture/fake/placeholder markers');
                add('no blocking consent/login dialog', !blockingDialogVisible(), 'A blocking consent/login dialog is visible');
            },
            popover() {
                const state = popoverState();
                add('Yomu popup visible', popupSizeVisible(state), 'Expected a visible Yomu lookup popup', { rect: state.rect });
                add('Yomu popup has Japanese lookup content', state.hasJapaneseText, 'Expected Japanese text inside the Yomu popup');
                add('Yomu popup has loaded content', state.hasLoadedText, 'Popup did not load enough visible lookup content', { text: state.text });
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
                const state = immersionState();
                add('immersion section open', state.open, 'Expected the Immersion Kit details section to be open');
                add('immersion example loaded', immersionExampleLoaded(state), 'Expected a real loaded immersion example');
                add('immersion translation revealed', immersionTranslationRevealed(state), 'Expected a revealed example translation', { translationText: state.translationText, blurred: state.blurred });
            },
            kanji() {
                const state = kanjiState();
                add('kanji drilldown visible', state.displayVisible, 'Expected a kanji drilldown popup');
                add('kanji stroke section open', state.strokeOpen, 'Expected open stroke/KanjiVG section with SVG');
                add('kanji facts loaded', state.factsLoaded, 'Expected loaded kanji facts/readings');
            },
            settingsDictionaries() {
                const state = settingsDictionariesState();
                add('settings dictionaries panel visible', settingsPanelVisible(state), 'Expected Yomu settings on Dictionaries');
                add('real imported dictionary rows visible', state.hasImportedRows, 'Expected at least one real imported dictionary row', { importedRows: state.importedRows });
            },
            settingsImages() {
                const state = settingsPanelState('media');
                add('settings media panel visible', settingsPanelVisible(state), 'Expected Yomu settings on Media');
                add('OCR controls visible', hasOcrSettingsControls(state.panel), 'Expected OCR settings controls');
            },
            settingsHelp() {
                const state = settingsPanelState('help');
                const text = visibleText(state.panel);
                add('settings help panel visible', settingsPanelVisible(state), 'Expected Yomu settings on Help');
                add('real help controls visible', /GitHub|Discord|Reset|Support|Docs/i.test(text), 'Expected real help/support controls', { text });
            },
            youtubeVideo() {
                const state = youtubeVideoState(expectedUrl);
                add('YouTube URL is a watch video', isYouTubeWatchVideoState(state), 'Expected a youtube.com/watch URL with a video id, not Shorts/search/channel UI', { href: state.href, current: state.current });
                add('YouTube target video id matches', youtubeTargetVideoMatches(state), 'Expected the configured YouTube target video id', { expected: state.expected, current: state.current, href: state.href });
                add('YouTube watch page visible', state.hasWatchUi, 'Expected real YouTube watch page UI');
                add('YouTube video surface visible', state.hasVisibleVideo, 'Expected visible YouTube video surface', { rect: state.videoRect });
                add('YouTube target video playing', youtubeTargetVideoPlaying(state), 'Expected the target video, not an ad or preview segment', { adShowing: state.adShowing, duration: state.durationRounded });
                add('no visible YouTube ads', youtubeAdsHidden(state), 'Expected no player, companion, display, or sponsored ad units in frame', { visibleAds: state.visibleAds });
            },
            cijAvailable() {
                const text = visibleText(document.body);
                const video = firstVisible('video, iframe[src*="vimeo"], iframe[src*="youtube"]');
                add('CIJ member content available', !/content restricted to members only|restricted to members only/i.test(text), 'CIJ content is unavailable; log in with a real member/test account');
                add('CIJ video surface visible', Boolean(video && video.getBoundingClientRect().width >= 320), 'Expected visible CIJ video surface', { rect: rectSummary(video) });
            },
            videoTranscript() {
                const state = videoTranscriptState();
                add('Yomu subtitle player visible', state.hasPlayer, 'Expected Yomu subtitle player controls');
                add('Yomu transcript side panel open', state.hasOpenPanel, 'Expected open Yomu transcript panel', { rect: state.panelRect });
                add('real video visible', state.hasVisibleVideo, 'Expected visible real video surface', { rect: state.videoRect });
                add('Japanese transcript rows visible', transcriptRowsVisible(state), 'Expected Japanese transcript rows', { rows: state.rows });
                add('active transcript row visible', state.hasActiveRow, 'Expected a current active transcript row');
                add('active transcript row framed', state.activeRowFramed, 'Expected the active transcript row to be fully visible inside the scroll frame', { active: state.activeRect, scroller: state.scrollerRect });
                add('subtitle text visible on player', JAPANESE_RE.test(state.playerText), 'Expected Japanese subtitle text on the video player', { playerText: state.playerText });
                add('transcript loaded', transcriptLoaded(state), 'Transcript panel is still waiting/loading', { panelText: state.panelText });
                add('parsed subtitle words visible', parsedSubtitleWordsVisible(state), 'Expected parsed .jpdb-reader-word spans in the overlay and transcript. Set YOMU_CAPTURE_API_KEY, YOMU_TEST_API_KEY, or YOMU_PROFILE_API_KEY in .env, or use a capture profile with imported dictionaries.', { overlayWords: state.overlayWords, rowWords: state.rowWords });
                add('subtitle word color signals visible', state.coloredWords > 0, 'Expected JPDB status or pitch color styling on parsed subtitle words', { coloredWords: state.coloredWords });
            },
            ocr() {
                const state = ocrState();
                add('real image content visible', state.images.length > 0, 'Expected visible real https image content', { images: state.images });
                add('OCR overlay visible', Boolean(state.layer), 'Expected Yomu OCR overlay');
                add('OCR Japanese text visible', state.hasJapaneseText, 'Expected recognized Japanese OCR text', { lines: state.lines, text: state.text });
                add('OCR line or popup active', state.hasActiveTarget, 'Expected an active/pinned OCR line or lookup popup from OCR text');
            },
            newtab() {
                const state = newTabState();
                add('Yomu new-tab visible', state.visible, 'Expected Yomu new-tab study UI');
                add('real study card visible', state.realStudyCard, 'Expected a real study card', { promptText: state.promptText, countText: state.countText });
                add('answer/details revealed', state.revealed, 'Expected the card answer/details to be revealed', { answerText: state.answerText });
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

        function popoverState() {
            const root = popover();
            const text = visibleText(root);
            return {
                root,
                text,
                rect: rectSummary(root),
                hasJapaneseText: Boolean(root && JAPANESE_RE.test(text)),
                hasLoadedText: Boolean(root && text.length >= 20),
            };
        }

        function popupSizeVisible(state) {
            return Boolean(state.root && state.rect && state.rect.width >= 280 && state.rect.height >= 180);
        }

        function kanjiState() {
            const root = popover();
            const display = root?.querySelector('.jpdb-reader-kanji-display');
            const stroke = root ? allIn(root, 'details.jpdb-reader-kanjivg').find(openVisibleDetails) : null;
            const facts = root?.querySelector('[data-kanji-jpdb-mount] .jpdb-reader-kanji-facts, .jpdb-reader-kanji-facts, .jpdb-reader-kanji-readings');
            const text = visibleText(root);
            return {
                displayVisible: Boolean(display && visible(display)),
                strokeOpen: Boolean(stroke?.querySelector('.jpdb-reader-kanjivg-svg')),
                factsLoaded: Boolean(facts && !/loading|unavailable/i.test(text)),
            };
        }

        function settingsPanelState(name) {
            const settings = firstVisible('.jpdb-reader-settings');
            return {
                settings,
                panel: settings?.querySelector(`fieldset[data-settings-panel="${name}"]:not([hidden])`),
            };
        }

        function settingsPanelVisible(state) {
            return Boolean(state.settings && state.panel && visible(state.panel));
        }

        function settingsDictionariesState() {
            const state = settingsPanelState('dictionaries');
            const rows = importedDictionaryRows(state.panel);
            const text = visibleText(state.panel);
            return {
                ...state,
                importedRows: rows.map(row => row.getAttribute('data-source-id')),
                hasImportedRows: rows.length > 0 && !/import yomitan dictionaries/i.test(text),
            };
        }

        function importedDictionaryRows(panel) {
            return panel ? allIn(panel, '.jpdb-reader-dictionary-row[data-dictionary-source-row]').filter(isImportedDictionaryRow) : [];
        }

        function isImportedDictionaryRow(row) {
            return !BUILT_IN_DICTIONARY_SOURCE_IDS.has(row.getAttribute('data-source-id') || '');
        }

        function hasOcrSettingsControls(panel) {
            return Boolean(panel?.querySelector('[name="ocrProvider"], [name="ocrShowTextOverlay"], [name="ocrAutoScanImages"]'));
        }

        function ocrState() {
            const layer = firstVisible('.jpdb-ocr-layer');
            const lineElements = layer ? allIn(layer, '.jpdb-ocr-line').filter(visible) : [];
            const text = lineElements.map(line => visibleText(line)).join(' ');
            return {
                images: realImageSources(),
                layer,
                lines: lineElements.length,
                text,
                hasJapaneseText: lineElements.length > 0 && JAPANESE_RE.test(text),
                hasActiveTarget: Boolean(lineElements.find(activeOcrLine) || popover()),
            };
        }

        function realImageSources() {
            return all('img')
                .filter(realVisibleImage)
                .slice(0, 4)
                .map(image => image.currentSrc || image.src);
        }

        function realVisibleImage(image) {
            return [
                visible(image),
                image.naturalWidth >= 200,
                image.naturalHeight >= 200,
                /^https:\/\//i.test(image.currentSrc || image.src),
            ].every(Boolean);
        }

        function activeOcrLine(line) {
            return line.classList.contains('jpdb-ocr-line-active') || line.dataset.pinned === 'true';
        }

        function newTabState() {
            const root = firstVisible('[data-jpdb-reader-root].jpdb-reader-newtab');
            const study = root?.querySelector('[data-newtab-study]');
            const promptText = visibleText(root?.querySelector('[data-newtab-prompt]'));
            const answerText = visibleText(root?.querySelector('[data-newtab-answer]'));
            const countText = visibleText(root?.querySelector('[data-newtab-count]'));
            return {
                promptText,
                answerText,
                countText,
                visible: newTabStudyVisible(root, study),
                realStudyCard: realNewTabStudyCard(promptText, countText),
                revealed: newTabAnswerRevealed(root, answerText),
            };
        }

        function newTabStudyVisible(root, study) {
            return Boolean(root && study && visible(study));
        }

        function realNewTabStudyCard(promptText, countText) {
            return JAPANESE_RE.test(promptText) && !/^0\s*\/\s*0$/.test(countText);
        }

        function newTabAnswerRevealed(root, answerText) {
            return Boolean(root?.classList.contains('jpdb-reader-newtab-revealed') || answerText.length > 2);
        }

        function styleVisible(style) {
            return [
                style.display !== 'none',
                style.visibility !== 'hidden',
                Number(style.opacity || 1) > 0.05,
            ].every(Boolean);
        }

        function rectVisible(rect) {
            return [
                rect.width > 2,
                rect.height > 2,
            ].every(Boolean);
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
            if (!readerWordHasSignalClass(word)) return false;
            const style = getComputedStyle(word);
            const parentStyle = word.parentElement ? getComputedStyle(word.parentElement) : null;
            return readerWordHasStyleSignal(style, parentStyle);
        }

        function readerWordHasSignalClass(word) {
            const className = word.className || '';
            return [
                /\bjpdb-(new|learning|known|due|failed|not-in-deck|never-forget|redundant|suspended)\b/,
                /\bjpdb-pitch-(heiban|atamadaka|nakadaka|odaka|kifuku)\b/,
            ].some(pattern => pattern.test(className));
        }

        function readerWordHasStyleSignal(style, parentStyle) {
            return [
                hasVisibleBackground(style.backgroundColor),
                hasVisibleUnderline(style),
                hasVisibleColorDifference(style, parentStyle),
            ].some(Boolean);
        }

        function hasVisibleBackground(value) {
            return !isTransparentColor(value);
        }

        function hasVisibleUnderline(style) {
            return style.textDecorationLine.includes('underline') && !isTransparentColor(style.textDecorationColor);
        }

        function hasVisibleColorDifference(style, parentStyle) {
            return Boolean(parentStyle && normalizedColor(style.color) !== normalizedColor(parentStyle.color));
        }

        function isTransparentColor(value) {
            return [
                !value,
                value === 'transparent',
                /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(value),
                /rgba?\([^)]*,\s*0\s*\)/i.test(value),
            ].some(Boolean);
        }

        function normalizedColor(value) {
            return value.replace(/\s+/g, '').toLowerCase();
        }

        function youtubeVideoState(expectedUrl) {
            const url = new URL(location.href);
            const video = firstVisible('video');
            const player = document.querySelector('#movie_player');
            const duration = video instanceof HTMLVideoElement ? video.duration : Number.NaN;
            return {
                href: location.href,
                pathname: url.pathname,
                expected: expectedYouTubeVideoId(expectedUrl),
                current: currentYouTubeVideoId(url),
                hasWatchUi: Boolean(document.querySelector('ytd-watch-flexy, #movie_player')),
                hasVisibleVideo: visibleVideoSurface(video),
                videoRect: rectSummary(video),
                adShowing: youtubePlayerShowingAd(player),
                visibleAds: visibleYouTubeAds(),
                duration,
                durationRounded: Number.isFinite(duration) ? Math.round(duration) : null,
            };
        }

        function currentYouTubeVideoId(url) {
            const candidates = [
                url.searchParams.get('v'),
                elementAttribute('ytd-watch-flexy', 'video-id'),
                elementAttribute('#movie_player', 'data-video-id'),
            ];
            return candidates.find(Boolean) || '';
        }

        function elementAttribute(selector, name) {
            return document.querySelector(selector)?.getAttribute(name) || '';
        }

        function visibleVideoSurface(video) {
            return Boolean(video && video.getBoundingClientRect().width >= 320);
        }

        function youtubePlayerShowingAd(player) {
            return Boolean(player?.classList.contains('ad-showing') || document.querySelector('.ytp-ad-player-overlay, .ytp-ad-preview-container'));
        }

        function isYouTubeWatchVideoState(state) {
            return state.pathname === '/watch' && Boolean(state.current);
        }

        function youtubeTargetVideoMatches(state) {
            return !state.expected || state.current === state.expected;
        }

        function youtubeTargetVideoPlaying(state) {
            return !state.adShowing && youtubeDurationLooksLikeTarget(state.duration);
        }

        function youtubeDurationLooksLikeTarget(duration) {
            return !Number.isFinite(duration) || duration > 60;
        }

        function youtubeAdsHidden(state) {
            return !state.adShowing && state.visibleAds.length === 0;
        }

        function videoTranscriptState() {
            const surfaces = videoTranscriptSurfaces();
            const words = videoTranscriptWords(surfaces);
            const panelText = visibleText(surfaces.panel);
            return {
                hasPlayer: Boolean(surfaces.player),
                hasOpenPanel: transcriptPanelOpen(surfaces.panel),
                hasVisibleVideo: visibleVideoSurface(surfaces.video),
                hasActiveRow: Boolean(surfaces.active),
                activeRowFramed: activeTranscriptRowFramed(surfaces),
                panelRect: rectSummary(surfaces.panel),
                videoRect: rectSummary(surfaces.video),
                activeRect: rectSummary(surfaces.active),
                scrollerRect: rectSummary(surfaces.scroller),
                rows: surfaces.rows.length,
                panelText,
                playerText: videoTranscriptPlayerText(surfaces),
                overlayWords: words.overlayWords.length,
                rowWords: words.rowWords.length,
                coloredWords: words.coloredWords.length,
            };
        }

        function videoTranscriptSurfaces() {
            const panel = firstVisible('.jpdb-subtitle-list:not([hidden])');
            return {
                player: firstVisible('.jpdb-subtitle-player'),
                panel,
                video: firstVisible('video, #movie_player'),
                overlay: firstVisible('.jpdb-subtitle-primary'),
                nativeCaption: firstVisible('.ytp-caption-segment, .caption-window'),
                rows: panel ? allIn(panel, '.jpdb-subtitle-list-row') : [],
                active: panel ? allIn(panel, '.jpdb-subtitle-list-row.active').find(visible) : null,
                scroller: panel?.querySelector('.jpdb-subtitle-list-scroll'),
            };
        }

        function videoTranscriptWords(surfaces) {
            const overlayWords = visibleReaderWords(surfaces.overlay, '.jpdb-reader-word');
            const rowWords = visibleReaderWords(surfaces.panel, '.jpdb-subtitle-row-text .jpdb-reader-word');
            return {
                overlayWords,
                rowWords,
                coloredWords: [...overlayWords, ...rowWords].filter(readerWordHasVisibleColorSignal),
            };
        }

        function visibleReaderWords(root, selector) {
            return root ? allIn(root, selector).filter(visible) : [];
        }

        function transcriptPanelOpen(panel) {
            return Boolean(panel && panel.getBoundingClientRect().width >= 260);
        }

        function activeTranscriptRowFramed(surfaces) {
            return Boolean(surfaces.active && rowFullyInsideScroller(surfaces.active, surfaces.scroller));
        }

        function videoTranscriptPlayerText(surfaces) {
            return `${visibleText(surfaces.overlay)} ${visibleText(surfaces.nativeCaption)}`.trim();
        }

        function transcriptRowsVisible(state) {
            return state.rows > 0 && JAPANESE_RE.test(state.panelText);
        }

        function transcriptLoaded(state) {
            return !/waiting for caption lines|captions are available|no subtitles|loading/i.test(state.panelText);
        }

        function parsedSubtitleWordsVisible(state) {
            return state.overlayWords > 0 && state.rowWords > 0;
        }

        function immersionState() {
            const root = popover();
            const details = root ? allIn(root, '[data-immersion-kit]').find(openVisibleDetails) : null;
            const sentence = details?.querySelector('.jpdb-reader-example-sentence');
            const translation = details?.querySelector('.jpdb-reader-example-translation');
            return {
                open: Boolean(details),
                hasCard: Boolean(details?.querySelector('.jpdb-reader-example-card')),
                sentenceText: visibleText(sentence),
                translationText: visibleText(translation),
                blurred: immersionTranslationBlurred(translation),
            };
        }

        function openVisibleDetails(item) {
            return item.open && visible(item);
        }

        function immersionTranslationBlurred(translation) {
            return translation?.dataset.immersionTranslationBlurred === 'true'
                || translation?.dataset.yomuImmersionTranslationBlurred === 'true';
        }

        function immersionExampleLoaded(state) {
            return state.hasCard && JAPANESE_RE.test(state.sentenceText);
        }

        function immersionTranslationRevealed(state) {
            return state.translationText.length >= 4 && !state.blurred;
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
            return rectFullyInside(row.getBoundingClientRect(), scroller.getBoundingClientRect());
        }

        function rectFullyInside(rowRect, scrollerRect) {
            return [
                rowRect.top >= scrollerRect.top + 2,
                rowRect.bottom <= scrollerRect.bottom - 2,
                rowRect.left >= scrollerRect.left,
                rowRect.right <= scrollerRect.right,
            ].every(Boolean);
        }
    }, { validators: scenario.validators, allowedHosts: scenario.hosts, theme, expectedUrl });
}

await main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
