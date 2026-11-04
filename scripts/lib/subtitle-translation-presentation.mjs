import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { openRecordedPage } from './recorded-page.mjs';
import { createReaderSmokeSettings } from './smoke-harness.mjs';

const source = '日本語を読みます。';
const translation = 'I read Japanese slowly and carefully';
const response = value => ({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
const captions = text => ({ events: [0, 1].map(index => ({ tStartMs: 1000 + index * 3000, dDurationMs: 3000, segs: [{ utf8: text }] })) });

// The saved YouTube page supplies host layout. Caption timings, latency and
// fullscreen activation are mechanism fixtures; the shipped bundle owns DOM.
export async function assertSubtitleTranslationPresentation(browser, engine, out, product) {
    const results = [];
    for (const scenario of [
        { width: 1280, height: 900, font: 28, fullscreen: false, failed: false },
        { width: 500, height: 600, font: 48, fullscreen: true, failed: false },
        { width: 390, height: 844, font: 40, fullscreen: false, failed: true },
    ]) results.push(await translationScenario(browser, scenario, product));
    writeFileSync(`${out}/${engine}-translation-presentation.json`, JSON.stringify(results, null, 2));
    return results;
}

async function translationScenario(browser, scenario, product) {
    const requested = [];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const answer = async url => {
        requested.push(url);
        if (new URL(url).searchParams.has('tlang')) {
            await pending;
            return response(scenario.failed ? { events: [] } : captions(translation));
        }
        return response(captions(source));
    };
    const run = await openRecordedPage({ browser, slug: 'youtube-watch', navigate: false, product,
        contextOptions: { viewport: { width: scenario.width, height: scenario.height } },
        hostOptions: { autoplay: false },
        settings: createReaderSmokeSettings({ learningTargetChosen: true, activeLanguageProfileId: 'subtitle-presentation-ja',
            languageProfiles: [{ schemaVersion: 2, id: 'subtitle-presentation-ja', outputLanguage: 'en', learnerLanguage: 'en', targetLanguage: 'ja', uiLocale: 'en', parserProvider: 'jpdb',
                dictionaries: { installed: [], enabled: [], order: [] }, definitionTranslationProviderIds: [] }],
            annotationsPaused: true, subtitleOverlayVisible: true, subtitleOverlayVisibleChosen: true,
            subtitleSecondaryVisible: true, subtitleSecondaryVisibleChosen: true, subtitleNativeBlurred: false,
            subtitleFontSize: scenario.font, subtitleControlsMode: 'always', subtitleHoverPause: false }),
        onGmRequest: request => request.url.includes('/api/timedtext') ? answer(request.url) : undefined,
    });
    const { context, page } = run;
    try {
        await installManualRecordedYouTubeCaptions(context, captions(source));
        await context.route('**/api/timedtext?**', async route => route.fulfill(await answer(route.request().url())));
        await context.route('**/translate.googleapis.com/**', route => route.abort('failed'));
        await page.goto(run.recording.manifest.url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            document.querySelectorAll('[role=dialog],tp-yt-paper-dialog,ytd-popup-container,tp-yt-iron-dropdown,tp-yt-iron-overlay-backdrop').forEach(element => {
                if (!element.closest('[data-jpdb-reader-root]')) element.remove();
            });
            const video = document.querySelector('video');
            video.pause(); video.currentTime = 1.3;
        });
        await page.waitForFunction(expected => document.querySelector('.jpdb-subtitle-primary')?.textContent === expected, source);
        await enterFixtureFullscreen(page, scenario.fullscreen);
        const before = await captionGeometry(page);
        assert.equal(before.primary, source);
        assert.equal(before.secondary, '');
        release();
        await waitForTranslationSettlement(page, scenario.failed);
        const after = await captionGeometry(page);
        assertCaptionSettlement(scenario, before, after);
        await page.setViewportSize({ width: Math.max(320, scenario.width - 70), height: scenario.height + 50 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const resized = await captionGeometry(page);
        assert.equal(resized.primary, source);
        assert.equal(resized.secondary, after.secondary);
        assert.equal(resized.font, scenario.font);
        return { ...scenario, before, after, resized, pageErrors: run.pageErrors };
    } catch (error) {
        const state = await page.evaluate(() => ({ primary: document.querySelector('.jpdb-subtitle-primary')?.textContent,
            secondary: document.querySelector('.jpdb-subtitle-secondary')?.textContent,
            options: [...document.querySelectorAll('.jpdb-subtitle-player select')].map(select => ({ value: select.value, text: select.textContent })),
            time: document.querySelector('video')?.currentTime }));
        throw new Error(`${error.message}\n${JSON.stringify({ scenario, requested, state })}`, { cause: error });
    } finally {
        release();
        await run.close();
    }
}

async function waitForTranslationSettlement(page, failed) {
    if (failed) {
        await page.locator('.jpdb-subtitle-panel-toggle').click();
        await page.locator('[data-action="panel-tracks"]').click();
        await page.locator('.jpdb-subtitle-track-row').filter({ hasText: 'failed' }).waitFor({ timeout: 15_000 });
    } else await page.waitForFunction(expected => document.querySelector('.jpdb-subtitle-secondary')?.textContent === expected, translation);
}

function assertCaptionSettlement(scenario, before, after) {
    assert.equal(after.primary, source, 'Translation settlement lost readable source');
    assert.equal(after.secondary, scenario.failed ? '' : translation);
    if (!scenario.failed) assert(Math.abs(after.bottom - before.bottom) <= 1, `Translation settlement moved the source baseline: ${JSON.stringify({ before, after })}`);
    assert.equal(after.font, scenario.font);
    if (scenario.fullscreen) assert(after.translationHeight > after.translationLineHeight * 2, 'Long translation did not wrap');
}

export async function installManualRecordedYouTubeCaptions(context, nativeTrack) {
    await context.addInitScript(nativeTrack => {
        let install;
        Object.defineProperty(window, '__yomuRecordedYouTubePlayer', {
            configurable: true, set: value => { install = value; },
            get: () => config => {
                const list = config.player.captions.playerCaptionsTracklistRenderer;
                list.captionTracks = list.captionTracks.map(({ kind, ...track }) => ({ ...track,
                    baseUrl: track.baseUrl.replace(/&(kind|caps)=asr/g, ''), vssId: '.ja', name: { simpleText: 'Japanese' } }));
                return install.call(window, { ...config, nativeTrack });
            },
        });
    }, nativeTrack);
}

async function captionGeometry(page) {
    return page.locator('.jpdb-subtitle-primary').evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const secondary = document.querySelector('.jpdb-subtitle-secondary');
        const primary = { primary: element.textContent, bottom: range.getBoundingClientRect().bottom, font: parseFloat(getComputedStyle(element).fontSize) };
        if (!secondary) return { ...primary, secondary: '', translationHeight: 0, translationLineHeight: 0 };
        return { ...primary, secondary: secondary.textContent, translationHeight: secondary.getBoundingClientRect().height,
            translationLineHeight: parseFloat(getComputedStyle(secondary).lineHeight) };
    });
}

async function enterFixtureFullscreen(page, enabled) {
    if (!enabled) return;
    await page.evaluate(() => {
        const button = document.createElement('button');
        button.id = 'translation-fullscreen-mechanism-fixture';
        button.textContent = 'Fullscreen mechanism fixture';
        button.style.cssText = 'position:fixed;top:4px;left:4px;z-index:3000';
        button.onclick = async () => {
            const player = document.querySelector('#movie_player');
            if (typeof player.requestFullscreen === 'function') await player.requestFullscreen();
            else {
                document.body.append(player); player.classList.add('ytp-fullscreen');
                player.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:1000';
                window.dispatchEvent(new Event('resize'));
            }
            button.remove();
        };
        document.body.append(button);
    });
    await page.locator('#translation-fullscreen-mechanism-fixture').click();
    await page.waitForFunction(() => !document.querySelector('#translation-fullscreen-mechanism-fixture'));
    await waitForCaptionAlignment(page);
}

async function waitForCaptionAlignment(page) {
    await page.waitForFunction(() => {
        const player = document.querySelector('#movie_player').getBoundingClientRect();
        const overlay = document.querySelector('.jpdb-subtitle-player').getBoundingClientRect();
        return Math.abs(player.width - overlay.width) < 1 && Math.abs(player.height - overlay.height) < 1;
    });
}
