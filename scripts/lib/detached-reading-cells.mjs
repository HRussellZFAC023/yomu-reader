import { withSmokeContexts } from './smoke-harness.mjs';
import * as smokeDependencyPaths from 'node:path';
import * as smokeDependencyUrls from 'node:url';
import * as smokeDependencyBrowsers from 'playwright';
import * as smokeDependencyBundler from 'esbuild';
import * as smokeDependencyFiles from 'node:fs';
import * as smokeDependencyOperatingSystem from 'node:os';

// Former fractional-projection-idempotence-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertFractionalProjectionIdempotence(_hostBrowser, _hostEngine) {
    return withSmokeContexts(_hostBrowser, async () => {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { default: path } = smokeDependencyPaths;
    const { fileURLToPath } = smokeDependencyUrls;
    const { chromium, webkit } = smokeDependencyBrowsers;
    const esbuild = smokeDependencyBundler;
// Real CSSOM gate for the additive projection hot path. Transformed text gives
// us fractional source geometry; an identical second pass must be a pure read.

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
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
    if (browserType.name() !== _hostEngine) return;
    const browser = _hostBrowser;

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

}

await runEngine('chromium', chromium);
await runEngine('webkit', webkit);
console.log('fractional projection idempotence smoke passed');


    });
}

// Former modal-reading-register-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertModalReadingRegister(_hostBrowser, _hostEngine) {
    return withSmokeContexts(_hostBrowser, async () => {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { mkdtempSync, readFileSync, rmSync, writeFileSync } = smokeDependencyFiles;
    const { tmpdir } = smokeDependencyOperatingSystem;
    const { default: path } = smokeDependencyPaths;
    const { fileURLToPath } = smokeDependencyUrls;
    const { chromium, webkit } = smokeDependencyBrowsers;
    const esbuild = smokeDependencyBundler;
/**
 * Real-engine register guard for readings painted over a fixed-position dialog.
 *
 * Reported on iPad Safari (store-jp.nintendo.com): a cart-limit dialog opened
 * over an annotated, scrolled page painted the readings for its button label
 * (お買い物を続ける -> か/もの/つづ) in empty space far ABOVE the button. The
 * words were annotated correctly; only the projected reading layer was
 * misplaced, by roughly the page's scroll offset.
 *
 * The class is coordinate-space, not "modals". Every projection layer is a
 * containing block for the clones inside it, so a clone's stamped offsets are
 * resolved against that layer's own box — which means a layer is only the space
 * its mode assumes for as long as its box sits where the mode expects. Any
 * ancestor that establishes a containing block for FIXED descendants moves it,
 * and a `transform` / `will-change` on the root (the momentum-scroll hints sites
 * hand iOS Safari) captures the viewport layer and parks it at the document
 * origin. Before the fix, the code measured the document and per-scroller layers
 * but ASSUMED the viewport layer sat at (0, 0), so every reading over fixed
 * content was stamped the whole scroll offset away from its word and no later
 * pass could recover it.
 *
 * So the assertion is about REGISTER — each reading's bottom abuts its own
 * word's top — checked when the dialog opens and again once everything has
 * settled, for the dialog's readings AND for ordinary page readings, in a plain
 * page and in a root-captured one. Deliberately NOT asserted: the single frame
 * immediately after a scroll. Viewport-follow readings are repositioned by a
 * refresh pass, so content that rides the document while classified viewport
 * lags by one frame there; that is inherent to the mode, self-corrects, and is
 * not the reported defect. It is still reported below as a diagnostic.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const IMPLEMENTATION_PATH = process.env.YOMU_MODAL_IMPL
    || path.join(ROOT, 'src/reader/dom/detached-reading-overlay-impl.ts');
const REGISTER_TOLERANCE_PX = 3;
const VIEWPORT = { width: 820, height: 640 };
// Enough page to scroll well past a viewport, and short enough that a dialog
// centred in a ROOT-CAPTURED scrim (which then spans the document, not the
// viewport) still paints on screen — otherwise the captured case would have
// nothing to measure and the guard would pass vacuously.
const PAGE_ROWS = 22;
const PAGE_SCROLL = 400;
// The reported displacement, reused as the scroll that happens under the dialog.
const EXTRA_SCROLL = 130;
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-modal-register-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

writeFileSync(entryPath, `
    import {
        clearProjectedReadings,
        syncProjectedReadings,
    } from ${JSON.stringify(IMPLEMENTATION_PATH)};

    const nextPaint = () => new Promise<void>(
        resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const settle = async () => {
        await nextPaint();
        await new Promise(resolve => setTimeout(resolve, 60));
        await nextPaint();
    };

    interface Annotated { anchor: HTMLElement; owner: HTMLElement; source: HTMLElement; key: string }

    const annotate = (host: HTMLElement, surface: string, reading: string, key: string): Annotated => {
        const anchor = document.createElement('span');
        anchor.style.cssText = 'display:inline-block;font:16px sans-serif;line-height:24px;';
        const owner = document.createElement('span');
        owner.className = 'jpdb-reader-word';
        owner.textContent = surface;
        owner.dataset.expression = key;
        const source = document.createElement('span');
        source.className = 'jpdb-reader-furi jpdb-reader-detached-furi';
        source.style.cssText = 'font:700 10px sans-serif;line-height:10px;';
        source.textContent = reading;
        owner.append(source);
        anchor.append(owner);
        host.append(anchor);
        return { anchor, owner, source, key };
    };

    const project = (target: Annotated) => {
        const measure = () => target.anchor.getBoundingClientRect();
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: measure(),
            measure,
        }]);
    };

    const cloneFor = (key: string) => [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
        .find(candidate => candidate.dataset.yomuExpression === key) ?? null;

    const layerMode = (clone: HTMLElement) => (
        clone.classList.contains('jpdb-reader-projected-furi-document') ? 'document'
            : clone.classList.contains('jpdb-reader-projected-furi-scroll') ? 'scroll'
                : 'viewport'
    );

    const round = (value: number) => Math.round(value * 10) / 10;

    /**
     * Worst vertical register across a batch: a reading's bottom must abut its
     * word's top. Only words the reader can actually see are judged — an
     * off-screen word is legitimately unpainted — and the count of judged
     * readings is returned so a band that saw nothing cannot pass silently.
     */
    const register = (targets: readonly Annotated[]) => {
        // A missing reading is the worst outcome there is, so it outranks any
        // finite offset rather than competing with one.
        const badness = (sample: { painted: boolean; alignment: number }) => (
            sample.painted ? Math.abs(sample.alignment) : Number.POSITIVE_INFINITY
        );
        let worst: { painted: boolean; alignment: number } | null = null;
        let checked = 0;
        for (const target of targets) {
            const wordRect = target.anchor.getBoundingClientRect();
            if (wordRect.bottom < 0 || wordRect.top > innerHeight) continue;
            checked += 1;
            const clone = cloneFor(target.key);
            const style = clone ? getComputedStyle(clone) : null;
            const painted = Boolean(clone) && style!.display !== 'none' && style!.visibility !== 'hidden';
            const canvas = document.createElement('canvas').getContext('2d')!;
            if (style) canvas.font = style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
            const cloneRect = painted ? clone!.getBoundingClientRect() : null;
            const sample = {
                key: target.key,
                base: { left: wordRect.left, right: wordRect.right, width: wordRect.width },
                naturalCanvasWidth: canvas.measureText(clone?.textContent ?? '').width,
                font: style ? { size:style.fontSize, weight:style.fontWeight, family:style.fontFamily } : null,
                transform: clone?.style.transform,
                visibility: style?.visibility,
                alignment: round(cloneRect ? cloneRect.bottom - wordRect.top : 0),
                mode: clone ? layerMode(clone) : 'none',
                painted,
                wordTop: round(wordRect.top),
                cloneBottom: cloneRect ? round(cloneRect.bottom) : 0,
            };
            if (!worst || badness(sample) > badness(worst)) worst = sample;
        }
        return { checked, worst };
    };

    // Both shapes are the same page in the same state — long, annotated,
    // scrolled — differing only in the one declaration that decides which box
    // the projection layers actually live in.
    const environments: Record<string, () => () => void> = {
        plain: () => () => {},
        // A compositor hint on the root. Paints nothing, but makes the root the
        // containing block for every fixed descendant, the reader's own viewport
        // layer included.
        rootTransform: () => {
            document.documentElement.style.setProperty('transform', 'translate3d(0,0,0)');
            return () => document.documentElement.style.removeProperty('transform');
        },
    };

    window.runModalRegisterProbe = async (shape: string) => {
        const page = document.createElement('div');
        page.style.cssText = 'margin:0;padding:0;';
        const pageTargets: Annotated[] = [];
        for (let index = 0; index < ${PAGE_ROWS}; index++) {
            const row = document.createElement('p');
            row.style.cssText = 'margin:0;padding:16px 0;font:16px sans-serif;';
            page.append(row);
            pageTargets.push(annotate(row, '記事', 'きじ', 'page-' + index));
        }
        document.body.append(page);
        pageTargets.forEach(project);
        const restoreEnvironment = environments[shape]();
        scrollTo(0, ${PAGE_SCROLL});
        await settle();
        const scrolledTo = scrollY;
        // The scrolled page the dialog is about to cover: the document layer has
        // to hold its own readings here, whatever captured the viewport layer.
        const beforeOpen = { page: register(pageTargets) };

        // The site's dialog markup lands first; the reader annotates what it finds.
        const scrim = document.createElement('div');
        scrim.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
            + 'width:320px;background:#fff;padding:16px;';
        const button = document.createElement('button');
        button.style.cssText = 'display:block;font:16px sans-serif;padding:12px 16px;margin:16px 0;'
            + 'background:#eee;border:1px solid #999;';
        dialog.append(button);
        scrim.append(dialog);
        document.body.append(scrim);
        const dialogTargets = [
            annotate(button, '買', 'か', 'dialog-ka'),
            annotate(button, '物', 'もの', 'dialog-mono'),
            annotate(button, '続', 'つづ', 'dialog-tsuzu'),
        ];
        await new Promise(resolve => setTimeout(resolve, 0));
        dialogTargets.forEach(project);
        await settle();

        const atOpen = { dialog: register(dialogTargets), page: register(pageTargets) };
        scrollBy(0, ${EXTRA_SCROLL});
        const inFrame = { dialog: register(dialogTargets), page: register(pageTargets) };
        await settle();
        const settled = { dialog: register(dialogTargets), page: register(pageTargets) };

        [...dialogTargets, ...pageTargets].forEach(target => clearProjectedReadings(target.owner));
        scrim.remove();
        page.remove();
        restoreEnvironment();
        scrollTo(0, 0);
        await settle();
        return { shape, scrolledTo, beforeOpen, atOpen, inFrame, settled };
    };
`);

esbuild.buildSync({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    logLevel: 'silent',
});

const css = readFileSync(path.join(ROOT, 'dist', 'yomu.css'), 'utf8');
const bundle = readFileSync(bundlePath, 'utf8');
const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body><script>${bundle}</script></body></html>`;

const SHAPES = ['plain', 'rootTransform'];
// What has to hold, and where. Ordinary page readings are judged on the scrolled
// page before the dialog covers it — once a full-bleed scrim is over them the
// overlay's occlusion guard hides them, which is correct, so there is nothing
// left to measure. The dialog's own readings are judged when it opens and again
// once everything settles. The single frame immediately after a scroll is
// diagnostic only; see the header.
const ASSERTED = [
    { phase: 'beforeOpen', band: 'page' },
    { phase: 'atOpen', band: 'dialog' },
    { phase: 'settled', band: 'dialog' },
];

function fail(scenario, message, detail) {
    throw new Error(`${scenario}: ${message}\n${JSON.stringify(detail, null, 2)}`);
}

function verifyRegister(scenario, phase, band, reading) {
    const { checked, worst } = reading;
    if (!checked) fail(scenario, `${phase} ${band} inspected no on-screen readings`, reading);
    if (!worst.painted) fail(scenario, `${phase} ${band} reading was not painted`, reading);
    if (Math.abs(worst.alignment) > REGISTER_TOLERANCE_PX) {
        fail(scenario, `${phase} ${band} reading sits ${worst.alignment}px off its word`, reading);
    }
}

function verifyShape(engine, shape, result) {
    const scenario = `${engine} ${shape}`;
    console.log(`${scenario}: ${JSON.stringify(result)}`);
    if (result.scrolledTo !== PAGE_SCROLL) {
        fail(scenario, `page scrolled to ${result.scrolledTo}, not ${PAGE_SCROLL}`, result);
    }
    for (const { phase, band } of ASSERTED) {
        verifyRegister(scenario, phase, band, result[phase][band]);
    }
}

async function verifyEngine(engine, browserType) {
    if (browserType.name() !== _hostEngine) return;
    const browser = _hostBrowser;

        const page = await browser.newPage({ viewport: VIEWPORT });
        await page.route('https://store-jp.nintendo.com/**', route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: fixture,
        }));
        await page.goto('https://store-jp.nintendo.com/modal-reading-register-smoke');
        for (const shape of SHAPES) {
            const result = await page.evaluate(
                probeShape => window.runModalRegisterProbe(probeShape),
                shape,
            );
            verifyShape(engine, shape, result);
        }

}

try {
    await verifyEngine('chromium', chromium);
    await verifyEngine('webkit', webkit);
    console.log('modal reading register smoke passed');
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}


    });
}

// Former reading-collision-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertReadingCollision(_hostBrowser, _hostEngine) {
    return withSmokeContexts(_hostBrowser, async () => {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { mkdtempSync, writeFileSync, rmSync } = smokeDependencyFiles;
    const { tmpdir } = smokeDependencyOperatingSystem;
    const { default: path } = smokeDependencyPaths;
    const { buildSync } = smokeDependencyBundler;
    const { chromium, webkit } = smokeDependencyBrowsers;
// Real-engine fixture: native text retains its line boxes; crowded readings
// hide at rest, recover when space opens, and stay available as lookup data.

const root = process.cwd();
const temporary = mkdtempSync(path.join(tmpdir(), 'yomu-reading-collision-'));
const entry = path.join(temporary, 'probe.ts');
const bundle = path.join(temporary, 'probe.js');
writeFileSync(entry, `
import { syncProjectedReadings, clearProjectedReadings, withProjectedReadingBatch } from ${JSON.stringify(path.join(root, 'src/reader/dom/detached-reading-overlay-impl.ts'))};
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
        .some(clone => clone.textContent === text && getComputedStyle(clone).display !== 'none' && getComputedStyle(clone).visibility !== 'hidden');
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
    const stable = document.createElement('div');
    stable.style.cssText='position:relative;margin-top:60px;line-height:40px';
    stable.innerHTML='<b>基</b><b>準</b><b>順</b>';
    document.body.append(stable);
    const words=[...stable.querySelectorAll<HTMLElement>('b')];
    const labels=['き','ながいちゅうおうのよみ','じゅん'];
    const owners=words.map((word,index)=>owner(word,[labels[index]]));
    const syncOwner=(index:number)=>syncProjectedReadings(owners[index].element,[{
        source:owners[index].sources[0],anchor:stable,rect:measure(words[index]),measure:()=>measure(words[index]),
    }]);
    withProjectedReadingBatch(document,()=>owners.forEach((_,index)=>syncOwner(index)));
    const snapshot=()=>[...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading]')]
        .filter(clone=>['き','ながいちゅうおうのよみ','じゅん'].includes(clone.textContent??''))
        .map(clone=>[clone.textContent,clone.style.display,clone.style.left,clone.style.transform,clone.style.visibility]);
    const settled=JSON.stringify(snapshot());
    const atomicHidden=!visible('ながいちゅうおうのよみ');
    let stableFrames=true;
    for(let frame=0;frame<20;frame++) await new Promise<void>(resolve=>requestAnimationFrame(()=>{
        syncOwner(1);
        stableFrames &&= JSON.stringify(snapshot())===settled;
        resolve();
    }));
    owners.forEach(reading=>clearProjectedReadings(reading.element));
    stable.remove();
    return { crowdedHidden, spacedVisible, sourceRetained, narrowHidden, wideVisible, nativeRectCount, atomicHidden, stableFrames };
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
    for (const [name, engine] of [[_hostEngine, _hostEngine === 'webkit' ? webkit : chromium]]) {
        const browser = _hostBrowser;

            const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
            await page.setContent(html);
            await page.addScriptTag({ path: bundle });
            const result = await page.evaluate(() => window.collisionProbe());
            if (Object.values(result).some(value => value === false) || result.nativeRectCount !== 2) {
                throw new Error(`${name}: collision/recovery regression ${JSON.stringify(result)}`);
            }
            console.log(`${name}: native and neighboring reading collision + recovery passed ${JSON.stringify(result)}`);

    }
} finally { rmSync(temporary, { recursive: true, force: true }); }


    });
}
