#!/usr/bin/env node
// Real CSSOM gate for the additive projection hot path. Transformed text gives
// us fractional source geometry; an identical second pass must be a pure read.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const [{ text: probeBundle }] = (await esbuild.build({
    bundle: true,
    format: 'iife',
    logLevel: 'silent',
    platform: 'browser',
    stdin: {
        contents: `
            import { projectAdditiveTextMirror } from ${JSON.stringify(path.join(root, 'src/reader/dom/index.ts'))};

            Object.assign(window, {
                async runFractionalProjectionProbe() {
                    const host = document.querySelector<HTMLElement>('#host')!;
                    const mirror = document.createElement('span');
                    mirror.className = 'jpdb-reader-text-mirror jpdb-reader-additive-text-mirror';
                    mirror.dataset.sourceText = '投票';
                    const word = document.createElement('span');
                    word.className = 'jpdb-reader-word jpdb-reader-scan-word';
                    word.dataset.yomuSourceStart = '0';
                    word.dataset.yomuSourceEnd = '2';
                    word.textContent = '投票';
                    mirror.append(word);
                    host.append(mirror);

                    projectAdditiveTextMirror(mirror, host);
                    await Promise.resolve();
                    const firstFragment = mirror.querySelector<HTMLElement>('.jpdb-reader-source-fragment');
                    if (!firstFragment) throw new Error('first projection produced no source fragment');
                    const cssGeometry = [
                        firstFragment.style.left,
                        firstFragment.style.top,
                        firstFragment.style.width,
                        firstFragment.style.height,
                        firstFragment.style.getPropertyValue('--jpdb-reader-source-gradient-width'),
                    ];
                    const scaleX = host.getBoundingClientRect().width / host.offsetWidth;
                    const ownedStyles = new Set(
                        [mirror, ...mirror.querySelectorAll<HTMLElement>('*')].map(element => element.style),
                    );
                    const geometryProperties = new Set([
                        'inset', 'width', 'height', 'padding', 'transform', 'position',
                        'left', 'top', 'margin',
                        '--jpdb-reader-source-gradient-width',
                        '--jpdb-reader-source-gradient-offset',
                    ]);
                    let geometrySetterCalls = 0;
                    const mutationRecords: string[] = [];
                    const observer = new MutationObserver(records => {
                        mutationRecords.push(...records.map(record => record.type + ':' + (record.attributeName ?? '')));
                    });
                    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
                    CSSStyleDeclaration.prototype.setProperty = function(property, value, priority) {
                        if (ownedStyles.has(this) && geometryProperties.has(property)) geometrySetterCalls += 1;
                        return originalSetProperty.call(this, property, value, priority);
                    };
                    observer.observe(mirror, { attributes: true, childList: true, subtree: true });
                    try {
                        projectAdditiveTextMirror(mirror, host);
                        await Promise.resolve();
                    } finally {
                        observer.disconnect();
                        CSSStyleDeclaration.prototype.setProperty = originalSetProperty;
                    }
                    return {
                        cssGeometry,
                        fractionalGeometry: cssGeometry.some(value => /\\d+\\.\\d+px/u.test(value)),
                        geometrySetterCalls,
                        mutationRecords,
                        reusedFragment: firstFragment === mirror.querySelector('.jpdb-reader-source-fragment'),
                        scaleX,
                    };
                },
            });
        `,
        loader: 'ts',
        resolveDir: root,
    },
    write: false,
})).outputFiles;

const fixture = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
body { margin: 40px; }
#host { position: relative; width: 173.33333333333334px; font: 17.3px/23.7px sans-serif; letter-spacing: .17px; transform: scale(1.2); transform-origin: 0 0; }
.jpdb-reader-text-mirror { position: absolute; inset: 0; display: block; pointer-events: none; }
</style></head><body><div id="host">投票</div></body></html>`;

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
        await page.setContent(fixture);
        await page.addScriptTag({ content: probeBundle });
        const result = await page.evaluate(() => window.runFractionalProjectionProbe());
        const valid = Math.abs(result.scaleX - 1.2) <= 0.01
            && result.fractionalGeometry
            && result.reusedFragment
            && result.geometrySetterCalls === 0
            && result.mutationRecords.length === 0;
        if (!valid) throw new Error(`${name} projection was not idempotent: ${JSON.stringify(result)}`);
        console.log(`${name}: scale=${result.scaleX.toFixed(3)} geometry=${result.cssGeometry.join('/')} setters=0 mutations=0`);
    } finally {
        await browser.close();
    }
}

await runEngine('chromium', chromium);
await runEngine('webkit', webkit);
console.log('fractional projection idempotence smoke passed');
