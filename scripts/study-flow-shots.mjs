// Screenshots the standalone step HTML snapshots (produced by study-flow-render.mts)
// at desktop + mobile viewports. Usage: node scripts/study-flow-shots.mjs <label>
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const LABEL = process.argv[2] ?? 'after';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(HERE, '..', '..', '..', 'qa-artifacts', 'yomu-reader', 'study-flow', LABEL);
const HTML_DIR = path.join(BASE, 'html');
const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
try {
    const files = readdirSync(HTML_DIR).filter(name => name.endsWith('.html'));
    for (const vp of VIEWPORTS) {
        const dir = path.join(BASE, vp.name);
        mkdirSync(dir, { recursive: true });
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        for (const file of files) {
            await page.goto(pathToFileURL(path.join(HTML_DIR, file)).href, { waitUntil: 'networkidle' });
            await page.waitForTimeout(150);
            const out = path.join(dir, file.replace('.html', '.png'));
            // Screenshot the study card itself so the crop hugs the content
            // (the stepper + prompt + per-step answer UI) instead of leaving a
            // tall band of empty background below it.
            const card = page.locator('.jpdb-reader-newtab-study').first();
            if (await card.count()) {
                await card.screenshot({ path: out });
            } else {
                await page.screenshot({ path: out, fullPage: false });
            }
        }
        await context.close();
    }
    console.log(JSON.stringify({ label: LABEL, base: BASE, files }, null, 2));
} finally {
    await browser.close();
}
