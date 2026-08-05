#!/usr/bin/env node
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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
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
            const painted = Boolean(clone) && getComputedStyle(clone!).display !== 'none';
            const cloneRect = painted ? clone!.getBoundingClientRect() : null;
            const sample = {
                key: target.key,
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
    const browser = await browserType.launch({ headless: true });
    try {
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
    } finally {
        await browser.close();
    }
}

try {
    await verifyEngine('chromium', chromium);
    await verifyEngine('webkit', webkit);
    console.log('modal reading register smoke passed');
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}
