#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium, devices, webkit } from 'playwright';

const root = process.cwd();
const manifestPath = resolve(root, 'docs/academy/audio/learning-voice-production-proof.json');
const productionPath = resolve(root, 'docs/academy/audio/learning-voice-production.json');
const catalogPath = resolve(root, 'public/academy/audio/learning-voice-playback.json');
const observedPath = resolve(process.env.LEARNING_VOICE_PRODUCTION_OBSERVED
    ?? resolve(root, 'qa-artifacts/academy-learning-voice/production-browser-observed.json'));
const manifest = JSON.parse(await readFile(manifestPath));
const productionSource = await readFile(productionPath);
const catalogSource = await readFile(catalogPath);
const catalog = JSON.parse(catalogSource);
const dryCheck = process.argv.includes('--dry-check');
const baseUrlArgument = argumentValue('--base-url');

const requiredCapabilities = [
    'response-content-sha256',
    'audio-decode',
    'natural-playback-completion',
    'request-cancellation',
    'service-worker-controlled',
    'cache-offline-replay',
    'chromium-desktop',
    'webkit-mobile',
    'axe-accessibility',
];
require(manifest.schema === 'yomu-academy.learning-voice-production-proof.v1', 'Production proof schema is stale.');
require(manifest.batchId === catalog.batchId, 'Production proof batch is stale.');
require(manifest.productionContractSha256 === sha256(productionSource), 'Production proof contract hash is stale.');
require(manifest.catalogSha256 === sha256(catalogSource), 'Production proof catalog hash is stale.');
require(JSON.stringify(manifest.requiredCapabilities) === JSON.stringify(requiredCapabilities),
    'Production proof capability contract is incomplete.');
require(manifest.base020Status === 'open', 'BASE-020 must remain open in this repair lane.');

if (dryCheck) {
    require(manifest.deploymentStatus === 'pending', 'Dry check expected an unreleased production proof.');
    require(manifest.verdict === 'pending', 'Dry check must not accept production before release.');
    console.log(JSON.stringify({
        schema: manifest.schema,
        deploymentStatus: manifest.deploymentStatus,
        verdict: manifest.verdict,
        base020Status: manifest.base020Status,
        capabilities: requiredCapabilities.length,
        mutation: false,
    }));
    process.exit(0);
}

const configuredBaseUrl = baseUrlArgument ?? manifest.deploymentBaseUrl;
require(typeof configuredBaseUrl === 'string' && configuredBaseUrl.length > 0,
    'Live production proof requires --base-url after deployment.');
const baseUrl = new URL(configuredBaseUrl);
require(baseUrl.protocol === 'https:', 'Live production proof requires HTTPS.');
require(!['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname), 'Live production proof rejects loopback origins.');
const academyUrl = new URL('/academy/', baseUrl);
const observed = {
    schema: 'yomu-academy.learning-voice-production-observed.v1',
    observedAt: new Date().toISOString(),
    batchId: catalog.batchId,
    baseUrl: academyUrl.href,
    releasePromotionPerformed: false,
    results: [],
};

for (const target of [
    { name: 'chromium-desktop', browserType: chromium, context: { viewport: { width: 1280, height: 800 } } },
    { name: 'webkit-mobile', browserType: webkit, context: { ...devices['iPhone 13'] } },
]) {
    const browser = await target.browserType.launch({ headless: true });
    const context = await browser.newContext({ ...target.context, serviceWorkers: 'allow' });
    try {
        const page = await context.newPage();
        await page.goto(academyUrl.href, { waitUntil: 'networkidle' });
        await page.evaluate(() => navigator.serviceWorker?.ready);
        if (!await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))) {
            await page.reload({ waitUntil: 'networkidle' });
        }
        require(await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
            `${target.name} is not service-worker controlled.`);

        const deployedCatalogResponse = await context.request.get(new URL('audio/learning-voice-playback.json', academyUrl).href);
        require(deployedCatalogResponse.status() === 200, `${target.name} deployed catalog returned ${deployedCatalogResponse.status()}.`);
        const deployedCatalogBytes = await deployedCatalogResponse.body();
        require(sha256(deployedCatalogBytes) === manifest.catalogSha256, `${target.name} deployed catalog bytes differ.`);

        const assets = [];
        for (const entry of catalog.entries) {
            const assetUrl = new URL(entry.url, academyUrl).href;
            const result = await page.evaluate(async ({ assetUrl, expectedSha256 }) => {
                const response = await fetch(assetUrl);
                const bytes = await response.arrayBuffer();
                const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
                    .map(value => value.toString(16).padStart(2, '0')).join('');
                const audioContext = new AudioContext();
                const decoded = await audioContext.decodeAudioData(bytes.slice(0));
                await audioContext.close();
                return {
                    status: response.status,
                    bytes: bytes.byteLength,
                    contentSha256: hash,
                    expectedSha256,
                    decodedDurationSeconds: decoded.duration,
                };
            }, { assetUrl, expectedSha256: entry.assetSha256 });
            require(result.status === 200 && result.bytes === entry.bytes, `${target.name} asset response is stale: ${entry.lineId}`);
            require(result.contentSha256 === entry.assetSha256, `${target.name} asset hash differs: ${entry.lineId}`);
            require(result.decodedDurationSeconds > 0, `${target.name} asset did not decode: ${entry.lineId}`);

            const completion = await naturalPlayback(page, assetUrl);
            require(completion === 'ended', `${target.name} playback did not complete: ${entry.lineId}`);
            assets.push({ lineId: entry.lineId, ...result, playback: completion });
        }

        const cancellation = await page.evaluate(async assetUrl => {
            const controller = new AbortController();
            const pending = fetch(`${assetUrl}?production-proof-cancel=${Date.now()}`, { signal: controller.signal });
            controller.abort();
            try {
                await pending;
                return 'completed-unexpectedly';
            } catch (error) {
                return error instanceof DOMException && error.name === 'AbortError' ? 'aborted' : String(error);
            }
        }, new URL(catalog.entries[0].url, academyUrl).href);
        require(cancellation === 'aborted', `${target.name} cancellation did not abort.`);

        await context.setOffline(true);
        const offlineAssets = await page.evaluate(async entries => Promise.all(entries.map(async entry => {
            const response = await fetch(entry.url);
            const bytes = await response.arrayBuffer();
            const contentSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
                .map(value => value.toString(16).padStart(2, '0')).join('');
            return { lineId: entry.lineId, status: response.status, bytes: bytes.byteLength, contentSha256 };
        })), catalog.entries.map(entry => ({
            lineId: entry.lineId,
            url: new URL(entry.url, academyUrl).href,
        })));
        await context.setOffline(false);
        require(offlineAssets.every((entry, index) => entry.status === 200
            && entry.bytes === catalog.entries[index].bytes
            && entry.contentSha256 === catalog.entries[index].assetSha256),
            `${target.name} offline cache replay failed.`);

        const accessibility = await new AxeBuilder({ page }).analyze();
        const seriousViolations = accessibility.violations.filter(violation => (
            violation.impact === 'serious' || violation.impact === 'critical'
        ));
        require(seriousViolations.length === 0, `${target.name} has serious accessibility violations.`);
        observed.results.push({
            target: target.name,
            serviceWorkerControlled: true,
            deployedCatalogSha256: sha256(deployedCatalogBytes),
            assets,
            cancellation,
            offlineAssets,
            seriousAccessibilityViolations: [],
            verdict: 'pass',
        });
    } finally {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
}

observed.verdict = observed.results.length === 2 && observed.results.every(result => result.verdict === 'pass')
    ? 'live-verification-pass-pending-intentional-promotion'
    : 'fail';
await mkdir(dirname(observedPath), { recursive: true });
await writeFile(observedPath, `${JSON.stringify(observed, null, 2)}\n`);
console.log(JSON.stringify(observed, null, 2));

async function naturalPlayback(page, assetUrl) {
    await page.evaluate(url => {
        document.querySelector('[data-learning-voice-production-proof-play]')?.remove();
        const button = document.createElement('button');
        button.id = 'learning-voice-production-proof-play';
        button.dataset.learningVoiceProductionProofPlay = 'true';
        button.textContent = 'Play production proof audio';
        window.__learningVoiceProductionPlayback = new Promise((resolvePlayback, rejectPlayback) => {
            button.addEventListener('click', () => {
                const audio = new Audio(url);
                audio.addEventListener('ended', () => resolvePlayback('ended'), { once: true });
                audio.addEventListener('error', () => rejectPlayback(new Error('audio error')), { once: true });
                void audio.play().catch(rejectPlayback);
            }, { once: true });
        });
        document.body.append(button);
    }, assetUrl);
    await page.locator('#learning-voice-production-proof-play').click();
    return page.evaluate(() => Promise.race([
        window.__learningVoiceProductionPlayback,
        new Promise((_, reject) => setTimeout(() => reject(new Error('playback timeout')), 30_000)),
    ]));
}

function argumentValue(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function require(condition, message) {
    if (!condition) throw new Error(message);
}
