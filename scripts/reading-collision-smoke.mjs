#!/usr/bin/env node
// Real-engine fixture: native text retains its line boxes; crowded readings
// hide at rest, recover when space opens, and stay available as lookup data.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { chromium, webkit } from 'playwright';

const root = process.cwd();
const temporary = mkdtempSync(path.join(tmpdir(), 'yomu-reading-collision-'));
const entry = path.join(temporary, 'probe.ts');
const bundle = path.join(temporary, 'probe.js');
writeFileSync(entry, `
import { syncProjectedReadings, clearProjectedReadings } from ${JSON.stringify(path.join(root, 'src/reader/dom/detached-reading-overlay-impl.ts'))};
import { nativeTextRects } from ${JSON.stringify(path.join(root, 'src/reader/dom/reading-collision.ts'))};
const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function measure(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect();
}
function owner(anchor: HTMLElement, texts: string[]) {
    const element = document.createElement('span');
    element.className = 'jpdb-reader-text-mirror';
    element.style.cssText = 'position:absolute;width:0;height:0;';
    const sources = texts.map(text => {
        const source = document.createElement('span');
        source.className = 'jpdb-reader-detached-furi';
        source.style.cssText = 'font-size:10px;line-height:1;color:black;';
        source.textContent = text;
        element.append(source);
        return source;
    });
    anchor.append(element);
    return { element, sources };
}
function visible(text: string) {
    return [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading]')]
        .some(clone => clone.textContent === text && getComputedStyle(clone).display !== 'none');
}
Object.assign(window, { async collisionProbe() {
    const anchor = document.querySelector<HTMLElement>('#vertical')!;
    const base = document.querySelector<HTMLElement>('#base')!;
    const reading = owner(anchor, ['かんじ']);
    const sync = () => syncProjectedReadings(reading.element, [{ source: reading.sources[0], anchor, rect: measure(base), measure: () => measure(base) }]);
    sync(); await frames();
    const crowdedHidden = !visible('かんじ');
    anchor.style.lineHeight = '42px';
    sync(); await frames();
    const spacedVisible = visible('かんじ');
    const sourceRetained = reading.sources[0].textContent === 'かんじ';
    clearProjectedReadings(reading.element);
    reading.element.remove();

    const horizontal = document.querySelector<HTMLElement>('#horizontal')!;
    const bases = [...horizontal.querySelectorAll<HTMLElement>('b')];
    const crowded = owner(horizontal, ['ひだりのながいよみ', 'ちゅうおうのながいよみ', 'みぎのながいよみ']);
    const syncHorizontal = () => syncProjectedReadings(crowded.element, bases.map((base, index) => ({
        source: crowded.sources[index], anchor: horizontal, rect: measure(base), measure: () => measure(base),
    })));
    syncHorizontal(); await frames();
    const narrowHidden = !visible('ちゅうおうのながいよみ');
    horizontal.style.letterSpacing = '80px';
    syncHorizontal(); await frames();
    const wideVisible = visible('ちゅうおうのながいよみ');
    clearProjectedReadings(crowded.element);
    const nativeRectCount = nativeTextRects(document.querySelector<HTMLElement>('#exclusions')!).length;
    return { crowdedHidden, spacedVisible, sourceRetained, narrowHidden, wideVisible, nativeRectCount };
} });
`);
buildSync({ entryPoints: [entry], outfile: bundle, bundle: true, format: 'iife', platform: 'browser', target: 'es2022' });
const html = `<!doctype html><meta charset="utf-8"><style>
body { margin:40px; font:16px Arial,sans-serif; background:white; color:black; }
#vertical { position:relative; margin-top:40px; line-height:16px; }
#horizontal { position:relative; margin-top:80px; line-height:40px; }
b { font-weight:400; }
.jpdb-reader-detached-furi:not([data-yomu-projected-reading]) { display:none; }
#exclusions { margin-top:80px; width:400px; }
</style><div id="vertical">Plain English and かな<br><span id="base">漢字</span></div>
<div id="horizontal"><b>漢</b><b>字</b><b>語</b></div>
<div id="exclusions">native<ruby>本<rt>ほん</rt></ruby><span class="jpdb-reader-text-mirror">duplicate</span></div>`;
try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
        const browser = await engine.launch({ headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
            await page.setContent(html);
            await page.addScriptTag({ path: bundle });
            const result = await page.evaluate(() => window.collisionProbe());
            if (Object.values(result).some(value => value === false) || result.nativeRectCount !== 2) {
                throw new Error(`${name}: collision/recovery regression ${JSON.stringify(result)}`);
            }
            console.log(`${name}: native and neighboring reading collision + recovery passed ${JSON.stringify(result)}`);
        } finally { await browser.close(); }
    }
} finally { rmSync(temporary, { recursive: true, force: true }); }
