#!/usr/bin/env node
// Built product on the recorded Wikipedia 日本語 article; JPDB is mocked and
// all other network traffic is offline. Study's real controls save the opt-in.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { openRecordedPage } from './lib/recorded-page.mjs';
import { fulfillHostedStudyAsset, HOSTED_STUDY_URL } from './lib/hosted-study-harness.mjs';
import { assert, createSmokePaths, launchSmokeBrowser, mockJpdbParseFromVocabulary, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';

const { artifacts } = createSmokePaths(import.meta.dirname);
const OUT = path.join(artifacts, 'ignored-words');
const SETTINGS = {
    onboardingSeen: true, learningTargetChosen: true, interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-token', jitenApiKey: '', ankiEnabled: false,
    localDictionariesEnabled: false, jpdbDefinitionsEnabled: false,
    audioEnabled: false, immersionKitEnabled: false, showFloatingButton: false,
};
const VOCABULARY = [
    ['は', 'は', 'は', 'particle', ['prt'], 1, ['blacklisted'], []],
    ['服部四郎', '服部四郎', 'はっとりしろう', 'name', ['n'], 1000, ['blacklisted'], []],
    ['日本語', '日本語', 'にほんご', 'Japanese', ['n'], 100, ['locked'], []],
    ['言語', '言語', 'げんご', 'language', ['n'], 200, ['suspended'], []],
];
const report = [];
mkdirSync(OUT, { recursive: true });
try {
    for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
        const browser = await launchSmokeBrowser(browserType, engine, { headless: true });
        const contextOptions = {
            viewport: engine === 'webkit' ? { width: 820, height: 1180 } : { width: 1280, height: 900 },
            hasTouch: engine === 'webkit', serviceWorkers: 'block',
        };
        try {
            const result = { engine, contextOptions };
            report.push(result);
            result.defaults = await checkArticle(browser, contextOptions, SETTINGS, true);
            const saved = await unhideIgnored(browser, contextOptions, engine === 'webkit' ? 'ja' : 'en');
            result.shown = await checkArticle(browser, contextOptions, saved, false);
        } finally {
            await browser.close();
        }
    }
    console.log('ignored words smoke passed (Chromium desktop, WebKit iPad touch; EN/JA Settings)');
} finally {
    writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

async function checkArticle(browser, contextOptions, settings, hidden) {
    const run = await openRecordedPage({
        browser, slug: 'ja-wikipedia-nihongo', settings, contextOptions, waitUntil: 'domcontentloaded',
        gmNetwork: 'offline', pageNetwork: 'offline', hosted: false,
        onGmRequest(request) {
            if (request.url !== 'https://jpdb.io/api/v1/parse') return;
            return {
                status: 200, contentType: 'application/json',
                body: JSON.stringify(mockJpdbParseFromVocabulary(JSON.parse(request.bodyText), VOCABULARY)),
            };
        },
    });
    try {
        const { page } = run;
        await page.locator('#mwCTQ').scrollIntoViewIfNeeded();
        await page.waitForSelector('#mwCTQ .jpdb-blacklisted[data-expression="服部四郎"]', { timeout: 30_000 });
        await page.waitForFunction(() => document.querySelector('p .jpdb-locked') && document.querySelector('p .jpdb-suspended'));
        await page.mouse.move(0, 0);
        const words = await page.locator('p .jpdb-reader-word:is(.jpdb-blacklisted, .jpdb-locked, .jpdb-suspended)').evaluateAll(elements => elements.map(word => {
            const style = getComputedStyle(word);
            const line = getComputedStyle(word, '::after');
            return {
                text: word.dataset.expression, classes: word.className,
                opacity: style.opacity, color: style.color,
                paragraphColor: getComputedStyle(word.closest('p')).color,
                nativeColor: getComputedStyle(word.parentElement).color,
                linked: Boolean(word.closest('a')),
                textFill: style.webkitTextFillColor,
                underline: line.borderBottomWidth !== '0px' && line.borderBottomStyle !== 'none'
                    && !/transparent|rgba\([^)]*, 0\)/.test(line.borderBottomColor),
                ignoredColor: style.getPropertyValue('--jpdb-reader-source-status-color').trim(),
            };
        }));
        for (const text of VOCABULARY.map(row => row[0])) assert(words.some(word => word.text === text), `Missing ignored-family word: ${text}`, words);
        for (const word of words) {
            assert(word.opacity === '1', `Faded ignored-family word: ${word.text}`, word);
            if (hidden) {
                assert(word.color === word.nativeColor && word.textFill === word.color, `Hidden ignored word changed the native ink: ${word.text}`, word);
                if (!word.linked) assert(word.color === word.paragraphColor, `Hidden ignored word changed the paragraph ink: ${word.text}`, word);
                assert(!word.underline, `Hidden ignored word has an underline: ${word.text}`, word);
            } else {
                assert(word.underline, `Unhidden ignored word has no underline: ${word.text}`, word);
                assert(word.color !== word.paragraphColor && word.textFill === word.color, `Unhidden ignored word has no state colour: ${word.text}`, word);
            }
        }
        return words;
    } finally {
        await run.close();
    }
}

async function unhideIgnored(browser, contextOptions, language) {
    const context = await browser.newContext(contextOptions);
    try {
        await context.route('**/*', route => new URL(route.request().url()).origin === 'https://yomureader.com'
            ? fulfillHostedStudyAsset(route) : route.abort());
        await context.addInitScript(({ key, settings }) => localStorage.setItem(key, JSON.stringify(settings)), {
            key: YOMU_SETTINGS_KEY, settings: { ...SETTINGS, interfaceLanguage: language },
        });
        const page = await context.newPage();
        await page.goto(`${HOSTED_STUDY_URL}#settings=appearance`, { waitUntil: 'domcontentloaded' });
        const ignored = page.locator('input[name="colorHide-ignored"]');
        await ignored.waitFor({ state: 'attached' });
        assert(await ignored.isChecked(), 'Ignored is not hidden by default');
        const label = await ignored.locator('..').innerText();
        assert(label.includes(language === 'ja' ? '無視' : 'Ignored') && !label.includes('未翻訳'), 'Ignored label is not translated', { language, label });
        assert(!(await page.locator('.jpdb-reader-settings').innerText()).includes('未翻訳'), 'Settings contains untranslated copy');
        if (contextOptions.hasTouch) await ignored.tap();
        else await ignored.uncheck();
        // Enabling the text channel makes the ignored colour test observable;
        // default page text colour is off, while the underline is status.
        const tuning = page.locator('[data-settings-tuning="appearance"] > summary');
        if (contextOptions.hasTouch) await tuning.tap();
        else await tuning.click();
        await page.locator('select[name="wordTextColorSource"]').selectOption('status');
        await page.locator('.jpdb-reader-settings button[type="submit"]').click();
        await page.waitForFunction(key => {
            const settings = JSON.parse(localStorage.getItem(key) ?? '{}');
            return settings.wordColorHiddenStateGroups && !settings.wordColorHiddenStateGroups.includes('ignored')
                && settings.wordTextColorSource === 'status';
        }, YOMU_SETTINGS_KEY);
        const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), YOMU_SETTINGS_KEY);
        // Carry the saved appearance choices into the reader's mock provider
        // setup; standalone Study has a separate credential authority.
        return {
            ...SETTINGS, interfaceLanguage: language,
            wordColorHiddenStateGroups: saved.wordColorHiddenStateGroups,
            wordTextColorSource: saved.wordTextColorSource,
            wordUnderlineColorSource: saved.wordUnderlineColorSource,
        };
    } finally {
        await context.close();
    }
}
