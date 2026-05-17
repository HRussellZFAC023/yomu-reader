#!/usr/bin/env node
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_USERSCRIPT = path.join(ROOT, 'dist/yomu.user.js');
const DEFAULT_PROFILE = path.join(process.env.TMPDIR ?? '/tmp', 'yomu-real-screenshot-profile');
const DEFAULT_TIMEOUT_MS = 60_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

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
        viewport: null,
        deviceScaleFactor: 1,
    });

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
        if (scenario.youtubeConsent) await installYouTubeConsentCookies(context);
        console.log(`\n== ${scenario.id} ==`);
        console.log(`URL: ${url}`);
        console.log(`Viewport: ${scenario.viewport.width}x${scenario.viewport.height}`);
        console.log(`Output: ${outputPath}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
        await waitForStablePage(page);
        if (!args.noInject && scenario.inject !== false) await injectUserscript(page, args.userscript);
        await dismissKnownConsentDialogs(page);

        if (!args.auto) {
            console.log('\nPrepare the page state:');
            for (const instruction of scenario.instructions) console.log(`  - ${instruction}`);
            await rl.question('\nPress Enter to validate and save this real screenshot, or Ctrl-C to abort. ');
        }

        await validateScenario(page, scenario, args.timeoutMs);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await page.screenshot({ path: outputPath, fullPage: false, animations: 'disabled' });
        console.log(`Saved ${outputPath}`);
    } finally {
        await page.close();
    }
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
        { name: 'PREF', value: 'hl=en-GB&tz=Europe.London', domain: '.youtube.com', path: '/', expires, sameSite: 'Lax', secure: true },
    ]);
}

async function dismissKnownConsentDialogs(page) {
    for (const label of [/Reject all/i, /Accept all/i, /I agree/i, /Got it/i, /閉じる/, /同意/]) {
        const button = page.getByRole('button', { name: label }).first();
        if (!await button.count()) continue;
        try {
            await button.click({ timeout: 1800 });
            await page.waitForTimeout(800);
            return;
        } catch {
            // Keep trying known consent labels; validation will fail if an overlay remains.
        }
    }
}

async function validateScenario(page, scenario, timeoutMs) {
    await page.waitForFunction(() => document.body && document.body.innerText.length > 0, null, { timeout: timeoutMs });
    assertLiveUrl(page.url(), scenario.hosts, scenario.id);

    const result = await page.evaluate(({ validators, allowedHosts }) => {
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
        const forbiddenPanelText = value => /translation unavailable|unavailable|loading|translating|failed|error|waiting for caption lines|no examples|例文なし/i.test(value);

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
                add('Yomu popup has loaded content', root && !forbiddenPanelText(text), 'Popup still contains loading/unavailable/failure text');
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
                const panel = settings?.querySelector('fieldset[data-settings-panel="images"]:not([hidden])');
                add('settings images panel visible', Boolean(settings && panel && visible(panel)), 'Expected Yomu settings on Images');
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
                const video = firstVisible('video');
                const watch = Boolean(document.querySelector('ytd-watch-flexy, #movie_player'));
                add('YouTube watch page visible', watch, 'Expected real YouTube watch page UI');
                add('YouTube video surface visible', Boolean(video && video.getBoundingClientRect().width >= 320), 'Expected visible YouTube video surface', { rect: rectSummary(video) });
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
                const rows = panel ? allIn(panel, '.jpdb-subtitle-list-row') : [];
                const active = panel ? allIn(panel, '.jpdb-subtitle-list-row.active').find(visible) : null;
                const panelText = visibleText(panel);
                add('Yomu subtitle player visible', Boolean(player), 'Expected Yomu subtitle player controls');
                add('Yomu transcript side panel open', Boolean(panel && panel.getBoundingClientRect().width >= 260), 'Expected open Yomu transcript panel', { rect: rectSummary(panel) });
                add('real video visible', Boolean(video && video.getBoundingClientRect().width >= 320), 'Expected visible real video surface', { rect: rectSummary(video) });
                add('Japanese transcript rows visible', rows.length > 0 && JAPANESE_RE.test(panelText), 'Expected Japanese transcript rows', { rows: rows.length });
                add('active transcript row visible', Boolean(active), 'Expected a current active transcript row');
                add('transcript loaded', !/waiting for caption lines|captions are available|no subtitles|loading/i.test(panelText), 'Transcript panel is still waiting/loading', { panelText });
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
        return { checks };

        function allIn(root, selector) {
            return [...root.querySelectorAll(selector)];
        }

        function blockingDialogVisible() {
            return all('[role="dialog"], dialog, tp-yt-paper-dialog, ytd-consent-bump-v2-lightbox')
                .some(element => visible(element)
                    && /before you continue|cookies and data|sign in to confirm|consent|restricted/i.test(visibleText(element)));
        }
    }, { validators: scenario.validators, allowedHosts: scenario.hosts });

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

await main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
