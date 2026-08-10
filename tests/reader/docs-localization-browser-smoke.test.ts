import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readerWordSurfaceText } from '../../src/reader/dom/reader-word';

const SMOKE_SOURCE = readFileSync('scripts/docs-localization-browser-smoke.mjs', 'utf8');
const DOCS_CONFIG_SOURCE = readFileSync('docs/.vitepress/config.mts', 'utf8');
const HOME_SOURCE = readFileSync('docs/index.md', 'utf8');
const THEME_SOURCE = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
const THEME_CSS = readFileSync('docs/.vitepress/theme/custom.css', 'utf8');
const USERSCRIPT_ENTRY_SOURCE = readFileSync('src/reader/userscript/entry.ts', 'utf8');
const STUDY_ENTRY_SOURCE = readFileSync('src/reader/newtab/entry.ts', 'utf8');
const ACADEMY_ENTRY_SOURCE = readFileSync('src/academy/entrypoint.ts', 'utf8');

function functionBody(name: string): string {
    const start = SMOKE_SOURCE.indexOf(`async function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name}`);
    const nextFunction = SMOKE_SOURCE.indexOf('\nasync function ', start + 1);
    return SMOKE_SOURCE.slice(start, nextFunction < 0 ? undefined : nextFunction);
}

describe('docs localization browser smoke readiness', () => {
    it('gates userscript side effects behind installed or hosted ownership', () => {
        const gate = 'if (installedRuntime || (docEl && shouldInstallHostedReaderRuntime())) {';
        const gateStart = USERSCRIPT_ENTRY_SOURCE.indexOf(gate);
        const gateEnd = USERSCRIPT_ENTRY_SOURCE.indexOf('\n}\n\nfunction bootWhenDocumentIsReady', gateStart);
        const guardedBoot = USERSCRIPT_ENTRY_SOURCE.slice(gateStart, gateEnd);

        expect(USERSCRIPT_ENTRY_SOURCE).toContain('const installedRuntime = announceInstalledReaderRuntime();');
        expect(USERSCRIPT_ENTRY_SOURCE).toContain('const docEl = document.documentElement;');
        expect(gateStart).toBeGreaterThan(
            USERSCRIPT_ENTRY_SOURCE.indexOf('const installedRuntime = announceInstalledReaderRuntime();'),
        );
        expect(gateEnd).toBeGreaterThan(gateStart);
        expect(guardedBoot).toContain("if (!installedRuntime) docEl.dataset.yomuHosted = '';");
        expect(guardedBoot).toContain('installPreferredJapaneseSiteLanguageFromStoredSettings()');
        expect(guardedBoot).toContain('applyMokuroReaderOcrDefault()');
        expect(guardedBoot).toContain('installUserscriptHttpBridgeWhenReady()');
        expect(guardedBoot).toContain('installUserscriptGmStorageBridgeWhenReady()');
        expect(guardedBoot).toContain('promoteStrandedHostedSettingsToGmStorage()');
        expect(guardedBoot).toContain('installPageOpenShadowRootDiscoveryBridge()');
        expect(guardedBoot).toContain('bootWhenDocumentIsReady()');
        expect(USERSCRIPT_ENTRY_SOURCE).toContain(
            'if (installedRuntime && !yomuNewTab) delete docEl?.dataset.yomuHosted;',
        );
    });

    it('marks page-owned Study and Academy policy before either app starts', () => {
        const studyMark = "if (!detectInstalledReaderRuntime()) document.documentElement.dataset.yomuHosted = '';";
        const academyMark = "if (shouldInstallHostedReaderRuntime()) document.documentElement.dataset.yomuHosted = '';";

        expect(STUDY_ENTRY_SOURCE).toContain(studyMark);
        expect(STUDY_ENTRY_SOURCE.indexOf(studyMark))
            .toBeLessThan(STUDY_ENTRY_SOURCE.indexOf('bootNewTabRuntime()'));
        expect(ACADEMY_ENTRY_SOURCE).toContain(academyMark);
        expect(ACADEMY_ENTRY_SOURCE.indexOf(academyMark))
            .toBeLessThan(ACADEMY_ENTRY_SOURCE.indexOf('void app.start()'));
    });

    it('runs one current hosted-locale contract in Chromium and Firefox', () => {
        const localeIsolation = functionBody('assertHostedLocaleIsolation');
        const contaminated = functionBody('assertContaminatedHostedContextStaysEnglish');
        const installed = functionBody('assertInstalledRuntimePreservesStoredState');
        const studyFirst = functionBody('assertStudyDoesNotContaminateRoot');
        const academyFirst = functionBody('assertAcademyDoesNotContaminateRoot');
        const firstRoot = SMOKE_SOURCE.indexOf("page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })");

        expect(SMOKE_SOURCE).toContain("import { chromium, firefox } from 'playwright'");
        expect(SMOKE_SOURCE).toContain("const BROWSER_NAME = process.env.YOMU_DOCS_BROWSER || 'chromium'");
        expect(SMOKE_SOURCE).toContain("url.hostname = 'yomureader.localhost'");
        expect(SMOKE_SOURCE).toContain("locale: 'en-GB'");
        expect(SMOKE_SOURCE).toContain("assertServerRenderedLocale('/', EN_STATIC_HEADING, JA_STATIC_HEADING, 'English')");
        expect(SMOKE_SOURCE).toContain("assertServerRenderedLocale('/ja/', JA_STATIC_HEADING, EN_STATIC_HEADING, 'Japanese')");
        expect(firstRoot).toBeGreaterThan(-1);
        expect(firstRoot).toBeLessThan(SMOKE_SOURCE.indexOf("chooseLocale(page, 'Change language', '/ja/')"));
        expect(localeIsolation).toContain("page.locator('html[data-yomu-hosted]')");
        expect(localeIsolation).toContain('page.evaluate(readLocalePolicySnapshot)');
        expect(SMOKE_SOURCE).toContain("localStorage.getItem('yomu:prefer-japanese-site-language:v1')");
        expect(SMOKE_SOURCE).toContain("localStorage.getItem('yomu:prefer-japanese-site-language')");
        expect(SMOKE_SOURCE).toContain("sessionStorage.getItem('yomu:jps')");
        expect(SMOKE_SOURCE).toContain('async function withLocaleProofPage(');
        expect(SMOKE_SOURCE).toContain('function seedLocaleProofStorage(');
        expect(contaminated).toContain("'yomu:settings-intent:v2':");
        expect(contaminated).toContain("'yomu:explicit-user-settings:v1':");
        expect(contaminated).toContain('contaminated: true');
        expect(localeIsolation).toContain("state.scalar, 'true'");
        expect(localeIsolation).toContain("state.startupCache, 'true'");
        expect(SMOKE_SOURCE).toContain('data-yomu-installed-runtime-kind="userscript"');
        expect(installed).toContain('state.runtimeScripts, 0');
        expect(installed).toContain('state.settings, expectedSettings');
        expect(studyFirst).toContain("window.__YOMU_READER_RUNTIME__ === 'newtab'");
        expect(studyFirst).toContain('document.documentElement.dataset.yomuHosted !== undefined');
        expect(academyFirst).toContain("'yomu:academy:language:v1': 'ja'");
        expect(academyFirst).toContain("assertEnglishHostedHomepage(page, 'Academy-to-English homepage'");
        expect(SMOKE_SOURCE).not.toContain('jpdb-reader-hosted-application');
    });

    it('uses deterministic compressed preview transport without weakening readiness', () => {
        const navigation = functionBody('navigateToAcademyShell');

        expect(SMOKE_SOURCE).toContain("'Accept-Encoding': BROWSER_NAME === 'chromium' ? 'gzip' : 'identity'");
        expect(SMOKE_SOURCE).toContain("await page.route('**/*', route => route.continue())");
        expect(SMOKE_SOURCE).toContain("assertPreviewTransport: BROWSER_NAME === 'chromium'");
        expect(navigation).toMatch(
            /assert\.equal\(\s*application\.headers\(\)\['content-encoding'\],\s*'gzip'/u,
        );
    });

    it('preloads the same SRI-bound core that the hosted graph executes', () => {
        expect(DOCS_CONFIG_SOURCE).toContain("createHash('sha256')");
        expect(DOCS_CONFIG_SOURCE).toContain('integrity: hostedReaderCoreIntegrity');
        expect(DOCS_CONFIG_SOURCE).toContain("crossorigin: 'anonymous'");
    });

    it('does not make Academy readiness depend on its offline precache becoming idle', () => {
        const navigation = functionBody('navigateToAcademyShell');

        expect(navigation).toContain("waitUntil: 'domcontentloaded'");
        expect(navigation).not.toContain("waitUntil: 'networkidle'");
        expect(navigation).toContain("assert.ok(response?.ok(), 'Academy route response failed')");
        expect(SMOKE_SOURCE.match(
            /await navigateToAcademyShell\(page(?:, \{ assertPreviewTransport: BROWSER_NAME === 'chromium' \})?\);/gu,
        )).toHaveLength(2);
    });

    it('keeps semantic cold-shell and hosted-runtime readiness assertions after navigation', () => {
        const academyFlow = SMOKE_SOURCE.slice(
            SMOKE_SOURCE.indexOf(
                "await navigateToAcademyShell(page, { assertPreviewTransport: BROWSER_NAME === 'chromium' });",
            ),
            SMOKE_SOURCE.indexOf('assert.deepEqual(hydrationMessages'),
        );
        const coldAssertion = functionBody('assertAcademyReaderCold');
        const runtimeAssertion = functionBody('assertHostedRuntimeOrder');

        expect(academyFlow).toMatch(
            /navigateToAcademyShell\(page, \{ assertPreviewTransport: BROWSER_NAME === 'chromium' \}\);[\s\S]*assertAcademyReaderCold\(page\);[\s\S]*navigateToAcademyShell\(page\);[\s\S]*assertHostedRuntimeOrder\(page,/u,
        );
        expect(coldAssertion).toContain(".academy-root').waitFor({ state: 'visible' })");
        expect(runtimeAssertion).toContain("data-yomu-runtime-health=\"ready\"");
        expect(runtimeAssertion).toContain("waitFor({ state: 'visible', timeout: 20_000 })");
        expect(runtimeAssertion).toContain("script.state === 'loaded'");
    });

    it('keeps the homepage smoke on one exact pointer-owned lookup target', () => {
        const lookupAssertion = functionBody('assertOwnedHoverLookup');

        expect(SMOKE_SOURCE).toContain('[data-expression="今日"]');
        expect(SMOKE_SOURCE).toContain('[data-sentence="今日は静かな喫茶店で新しい本を読みました。"]');
        expect(SMOKE_SOURCE).toContain('[data-token-start="0"][data-token-end="2"]');
        expect(SMOKE_SOURCE).toContain("lookupExpression: '今日'");
        expect(lookupAssertion).toContain('document.elementFromPoint(x, y)');
        expect(lookupAssertion).toContain("lookupTarget.matches(':hover')");
        expect(lookupAssertion).toContain('spellingText.includes(expression)');
        expect(lookupAssertion).toContain('requestAnimationFrame(sample)');
        expect(lookupAssertion).toContain('if (ownsPointer) return');
        expect(lookupAssertion).toContain('probe.lost = true');
        expect(lookupAssertion).toContain('probe.rotated');
        expect(lookupAssertion).toContain('!probe.lost');
        expect(lookupAssertion).toContain('await page.mouse.move(center.x, center.y)');
        expect(lookupAssertion).toContain('{ timeout: 8_000 }');
        expect(lookupAssertion).not.toContain('.click(');
    });

    it('reserves the tallest roster headline at every responsive boundary', () => {
        const geometryAssertion = functionBody('assertHeroHeadlineReservation');

        expect(THEME_SOURCE).toContain('buildHostedHeroSizingLayer(languages)');
        expect(THEME_SOURCE).toContain("layer.setAttribute('aria-hidden', 'true')");
        expect(THEME_SOURCE).toContain("layer.setAttribute('data-jpdb-reader-surface-ignore', 'true')");
        expect(THEME_SOURCE).toContain("heading.setAttribute('aria-label', (liveFrame.textContent || '').trim())");
        expect(THEME_SOURCE).toContain('for (const language of languages)');
        expect(THEME_CSS).toContain(".yomu-fold-h1[data-yomu-hero-rotator='on']");
        expect(THEME_CSS).toContain('.yomu-home .yomu-fold-h1-reserve-candidate');
        expect(THEME_CSS).toContain('grid-area: 1 / 1');
        expect(geometryAssertion).toContain('HERO_GEOMETRY_WIDTHS');
        expect(geometryAssertion).toContain('geometry.candidateCount, geometry.declaredCount');
        expect(geometryAssertion).toContain('geometry.reserveHeight - geometry.maxCandidateHeight');
        expect(geometryAssertion).toContain('geometry.headingHeight - geometry.reserveHeight');
        expect(geometryAssertion).toContain('geometry.accessibleName, geometry.liveText');
        expect(geometryAssertion).toContain("geometry.reservePointerEvents, 'none'");
        const promptAssertion = functionBody('assertFoldPromptChrome');
        expect(promptAssertion).toContain("state.ariaHidden, null");
        expect(promptAssertion).toContain("state.fallbackTag, 'A'");
        expect(promptAssertion).toContain("state.fallbackHref, '#read'");
        expect(promptAssertion).toContain("state.fallbackPointerEvents, 'none'");
    });

    it('gives every pre-rendered Try Me word exact source geometry without claiming card identity', () => {
        const page = new DOMParser().parseFromString(HOME_SOURCE, 'text/html');
        const heading = page.querySelector('#yomu-home-title');
        const prompt = page.querySelector('[data-yomu-fold-prompt]');
        const sample = page.querySelector('.yomu-try-me-sample');
        const words = Array.from(sample?.querySelectorAll<HTMLElement>('.jpdb-reader-word') ?? []);

        expect(heading?.getAttribute('data-jpdb-reader-surface-ignore')).toBe('true');
        expect(prompt?.getAttribute('data-jpdb-reader-surface-ignore')).toBe('true');
        expect(sample?.hasAttribute('data-jpdb-reader-surface-ignore')).toBe(false);
        expect(words.map(word => ({
            expression: word.dataset.expression,
            surface: readerWordSurfaceText(word),
            start: Number(word.dataset.tokenStart),
            end: Number(word.dataset.tokenEnd),
        }))).toEqual([
            { expression: '今日', surface: '今日', start: 0, end: 2 },
            { expression: '静か', surface: '静かな', start: 3, end: 6 },
            { expression: '喫茶店', surface: '喫茶店', start: 6, end: 9 },
            { expression: '新しい', surface: '新しい', start: 10, end: 13 },
            { expression: '本', surface: '本', start: 13, end: 14 },
            { expression: '読む', surface: '読みました', start: 15, end: 20 },
        ]);
        for (const word of words) {
            const sentence = word.dataset.sentence ?? '';
            const start = Number(word.dataset.tokenStart);
            const end = Number(word.dataset.tokenEnd);
            expect(sentence).toBe('今日は静かな喫茶店で新しい本を読みました。');
            expect(sentence.slice(start, end)).toBe(readerWordSurfaceText(word));
            expect(word.hasAttribute('data-vid')).toBe(false);
            expect(word.hasAttribute('data-sid')).toBe(false);
        }
    });
});
