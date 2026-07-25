#!/usr/bin/env node
// Real-engine regression for drag-handle touch gestures.
//
// A drag handle must resolve to `touch-action: none` on a coarse pointer. Every
// control in a toolbar also picks up a family-wide 44px touch-target rule, and
// that family selector outranks a single handle's own declaration — so the
// browser keeps the pan gesture and dragging the handle scrolls the page
// instead of moving the control. Specificity is invisible to jsdom (which does
// not evaluate `(any-pointer: coarse)`), so this has to run in real engines.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const css = readFileSync(path.join(ROOT, 'dist', 'yomu.css'), 'utf8');

// The real rail markup: the handle is a member of `.jpdb-subtitle-rail button`,
// which is exactly what makes it vulnerable to the family touch-target rule.
const FIXTURE = `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <div class="jpdb-subtitle-player">
    <div class="jpdb-subtitle-rail">
      <button class="jpdb-subtitle-rail-move" type="button" data-action="rail-expand"
              data-subtitle-rail-drag-handle aria-label="move">grip</button>
      <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel">panel</button>
    </div>
  </div>
  <div class="jpdb-reader-settings">
    <button data-source-drag-handle type="button" tabindex="-1">drag</button>
  </div>
</body></html>`;

const HANDLES = [
    { name: 'subtitle rail move handle', selector: '[data-subtitle-rail-drag-handle]' },
    { name: 'settings source reorder handle', selector: '[data-source-drag-handle]' },
];

function fail(engine, message, detail) {
    throw new Error(`${engine}: ${message}\n${JSON.stringify(detail, null, 2)}`);
}

async function verifyEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        // hasTouch + a narrow viewport puts us inside the coarse-pointer media
        // query where the 44px touch-target rules apply.
        const context = await browser.newContext({
            viewport: { width: 760, height: 1024 },
            hasTouch: true,
            isMobile: true,
        });
        const page = await context.newPage();
        await page.setContent(FIXTURE, { waitUntil: 'domcontentloaded' });

        for (const handle of HANDLES) {
            const result = await page.evaluate(selector => {
                const element = document.querySelector(selector);
                if (!(element instanceof HTMLElement)) return { missing: true };
                return {
                    missing: false,
                    touchAction: getComputedStyle(element).touchAction,
                    coarsePointer: matchMedia('(any-pointer: coarse)').matches,
                };
            }, handle.selector);

            if (result.missing) fail(name, `${handle.name} did not render`, { selector: handle.selector });
            if (!result.coarsePointer) {
                fail(name, 'fixture is not on a coarse pointer, so the family rule under test never applies', result);
            }
            // 'manipulation' and 'pan-*' both leave the pan gesture with the
            // browser, which is the defect; only 'none' hands the drag to us.
            if (result.touchAction !== 'none') {
                fail(name, `${handle.name} does not own its touch gesture — dragging it will scroll the page`, {
                    selector: handle.selector,
                    touchAction: result.touchAction,
                    expected: 'none',
                });
            }
            console.log(`${name} ${handle.name}: touch-action=${result.touchAction}`);
        }
    } finally {
        await browser.close();
    }
}

await verifyEngine('chromium', chromium);
await verifyEngine('webkit', webkit);
console.log('drag handle gesture smoke passed');
