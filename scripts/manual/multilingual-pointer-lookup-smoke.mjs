#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from '../lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback } from '../lib/smoke-test-helpers.mjs';

const smokePaths = createSmokePaths(import.meta.dirname);
const ROOT = smokePaths.root;
const SCRIPT_PATH = process.env.A37_USERSCRIPT_PATH ?? smokePaths.scriptPath;
const CSS_PATH = process.env.A37_CSS_PATH ?? smokePaths.cssPath;
const SCRATCHPAD = process.env.A37_SCRATCHPAD
    ?? '/private/tmp/claude-503/-Users-heru-Documents-Projects-yomu/ed29fd24-cb26-419f-9401-4f28d02bf06a/scratchpad';
const PHASE = process.env.A37_SCREENSHOT_PHASE ?? 'after';
const REQUESTED_LANGUAGES = new Set(
    (process.env.A37_LANGUAGES ?? 'ja,ko,es,ar,el').split(',').map(value => value.trim()).filter(Boolean),
);
const CASES = [
    { language: 'ja', label: 'japanese', url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC', term: '日本' },
    { language: 'ko', label: 'korean', url: 'https://ko.wikipedia.org/wiki/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD', term: '대한민국' },
    { language: 'es', label: 'spanish', url: 'https://es.wikipedia.org/wiki/Idioma_espa%C3%B1ol', term: 'español' },
    { language: 'ar', label: 'arabic', url: 'https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D9%84%D8%BA%D8%A9_%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9', term: 'العربية' },
    { language: 'el', label: 'greek', url: 'https://el.wikipedia.org/wiki/%CE%95%CE%BB%CE%BB%CE%B7%CE%BD%CE%B9%CE%BA%CE%AE_%CE%B3%CE%BB%CF%8E%CF%83%CF%83%CE%B1', term: 'Ελληνική' },
].filter(testCase => REQUESTED_LANGUAGES.has(testCase.language));

assert(CASES.length > 0, 'A37_LANGUAGES did not name a supported smoke case.');
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');
mkdirSync(SCRATCHPAD, { recursive: true });

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const reports = [];

try {
    for (const testCase of CASES) {
        const context = await browser.newContext({
            bypassCSP: true,
            viewport: { width: 1360, height: 900 },
            deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        await page.exposeFunction('__yomuA37Request', async () => ({
            status: 503,
            statusText: 'A37 deterministic keyless proof',
            responseText: '',
            responseHeaders: '',
        }));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: settingsFor(testCase.language),
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: '__yomuA37Request',
        });

        await page.goto(testCase.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.addStyleTag({ path: CSS_PATH });
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForSelector('#jpdb-reader-installed-runtime', { state: 'attached', timeout: 20_000 });

        const heading = page.locator('#firstHeading').first();
        await heading.waitFor({ state: 'visible', timeout: 20_000 });
        const rawReaderWords = await heading.locator('.jpdb-reader-word').count();
        assert(rawReaderWords === 0, 'The proof target was annotated; this must exercise raw pointer text.', {
            language: testCase.language,
            rawReaderWords,
        });

        const point = await heading.evaluate(termPoint, testCase.term);
        assert(point, 'Could not locate the proof term in the real page heading.', {
            language: testCase.language,
            term: testCase.term,
            heading: await heading.innerText(),
        });
        await page.mouse.click(point.x, point.y);
        const popover = page.locator('.jpdb-reader-popover[role="dialog"]').last();
        await popover.waitFor({ state: 'visible', timeout: 12_000 });
        await page.waitForFunction(
            term => document.querySelector('.jpdb-reader-popover[role="dialog"]')?.textContent?.includes(term),
            testCase.term,
            { timeout: 12_000 },
        );

        const proof = await page.evaluate(term => {
            const popover = document.querySelector('.jpdb-reader-popover[role="dialog"]');
            return {
                heading: document.querySelector('#firstHeading')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
                popoverText: popover?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 500) ?? '',
                popoverLanguage: popover?.getAttribute('data-language') ?? '',
                containsTerm: popover?.textContent?.includes(term) ?? false,
            };
        }, testCase.term);
        assert(proof.containsTerm, 'Popover opened without the pressed target-language word.', {
            language: testCase.language,
            ...proof,
        });
        if (PHASE !== 'before') {
            assert(proof.popoverLanguage === testCase.language, 'Popover root does not carry the active target language.', {
                language: testCase.language,
                ...proof,
            });
        }

        await page.waitForTimeout(250);
        const screenshot = path.join(
            SCRATCHPAD,
            `a37-${PHASE}-${testCase.language}-wikipedia-${testCase.label}-popover.png`,
        );
        await page.screenshot({ path: screenshot, fullPage: false });
        reports.push({ ...testCase, screenshot, rawReaderWords, ...proof });
        await context.close();
    }
} finally {
    await browser.close();
}

const report = { ok: true, phase: PHASE, builtUserscript: path.relative(ROOT, SCRIPT_PATH), cases: reports };
const reportPath = path.join(SCRATCHPAD, `a37-${PHASE}-multilingual-pointer-browser.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, reportPath }, null, 2));

function settingsFor(targetLanguage) {
    return {
        onboardingSeen: true,
        interfaceLanguage: 'en',
        languageProfiles: [{
            // Deliberately revision 1: this smoke also proves that a profile
            // written before the U105 tier split still loads, with its
            // `learnerLanguage` read as the OUTPUT axis.
            schemaVersion: 1,
            id: 'a37-proof',
            learnerLanguage: 'en',
            targetLanguage,
            uiLocale: 'en',
            parserProvider: 'local',
            dictionaries: { installed: [], enabled: [], order: [] },
            definitionTranslationProviderIds: [],
        }],
        activeLanguageProfileId: 'a37-proof',
        apiKey: '',
        jitenApiKey: '',
        jpdbDefinitionsEnabled: false,
        jitenDefinitionsEnabled: false,
        bunproDefinitionsEnabled: false,
        wanikaniDefinitionsEnabled: false,
        localDictionariesEnabled: false,
        annotationsPaused: false,
        manualScanEnabled: true,
        lookupOnClick: true,
        lookupOnHover: false,
        popupActivationMode: 'click',
        preferJapaneseSiteLanguage: false,
        showPitchAccent: false,
        showFloatingButton: false,
        audioEnabled: false,
        autoPlayAudio: false,
        immersionKitEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        enableLogging: false,
    };
}

function termPoint(element, term) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = node.textContent?.indexOf(term) ?? -1;
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
}
