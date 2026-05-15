#!/usr/bin/env node
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCS_DIST = path.join(ROOT, 'docs/.vitepress/dist');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');

const pages = [
    { name: 'home', path: '/' },
    { name: 'getting-started', path: '/getting-started' },
    { name: 'features', path: '/features' },
    { name: 'local-audio', path: '/local-audio' },
    { name: 'support', path: '/support' },
    { name: 'changelog', path: '/changelog' },
    { name: 'newtab-fallback', path: '/newtab/' },
];

const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'iphone', width: 390, height: 844 },
];

function assertAudit(condition, message) {
    if (!condition) throw new Error(message);
}

async function startDocsServer(root) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            const pathname = decodeURIComponent(url.pathname).replace(/^\/yomu-reader/, '') || '/';
            const filePath = await resolveDocsFile(root, pathname);
            const body = await readFile(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType(filePath));
            res.end(body);
        } catch {
            res.statusCode = 404;
            res.end('Not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        origin: `http://127.0.0.1:${address.port}/yomu-reader`,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}

async function resolveDocsFile(root, pathname) {
    const clean = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const candidates = docsFileCandidates(root, clean);
    for (const candidate of candidates) {
        const info = await stat(candidate).catch(() => null);
        if (info?.isFile()) return candidate;
    }
    throw new Error(`No docs file for ${pathname}`);
}

function docsFileCandidates(root, clean) {
    if (clean === '/' || clean === '') return [path.join(root, 'index.html')];
    if (clean.endsWith('/')) return [path.join(root, clean, 'index.html')];
    return [
        path.join(root, clean),
        path.join(root, `${clean}.html`),
        path.join(root, clean, 'index.html'),
    ];
}

function contentType(filePath) {
    return DOCS_CONTENT_TYPES.find(({ extension }) => filePath.endsWith(extension))?.type ?? 'application/octet-stream';
}

const DOCS_CONTENT_TYPES = [
    { extension: '.html', type: 'text/html; charset=utf-8' },
    { extension: '.css', type: 'text/css; charset=utf-8' },
    { extension: '.js', type: 'text/javascript; charset=utf-8' },
    { extension: '.svg', type: 'image/svg+xml; charset=utf-8' },
    { extension: '.png', type: 'image/png' },
    { extension: '.woff2', type: 'font/woff2' },
];

async function waitForStablePage(page) {
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => [...document.images].every(image => image.complete), null, { timeout: 8000 }).catch(() => undefined);
}

async function assertDocsAccessibility(page, label) {
    const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
    const violations = axe.violations
        .filter(violation => violation.impact !== 'minor')
        .map(violation => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.slice(0, 5).map(node => node.target.join(' ')),
        }));
    assertAudit(!violations.length, `${label} axe violations: ${JSON.stringify(violations)}`);

    const wcag = await page.evaluate(() => {
        const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== 'hidden'
                && style.display !== 'none'
                && Number(style.opacity || 1) > 0.02
                && rect.width > 0
                && rect.height > 0;
        };
        const accessibleName = element => (element.getAttribute('aria-label')
            || element.getAttribute('title')
            || element.getAttribute('alt')
            || element.textContent
            || '').replace(/\s+/g, ' ').trim();
        const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])')]
            .filter(element => visible(element));
        const unnamedControls = interactive
            .filter(element => !accessibleName(element))
            .map(element => element.outerHTML.slice(0, 140));
        const smallTargets = interactive
            .filter(element => {
                const style = getComputedStyle(element);
                return !(element.tagName.toLowerCase() === 'a' && style.display === 'inline');
            })
            .map(element => {
                const rect = element.getBoundingClientRect();
                return { name: accessibleName(element), tag: element.tagName.toLowerCase(), width: rect.width, height: rect.height };
            })
            .filter(item => item.width < 24 || item.height < 24);
        const brokenImages = [...document.images]
            .filter(image => visible(image) && (!image.complete || image.naturalWidth <= 0))
            .map(image => image.getAttribute('src') || image.currentSrc);
        const missingAlt = [...document.images]
            .filter(image => visible(image) && !image.hasAttribute('alt'))
            .map(image => image.getAttribute('src') || image.currentSrc);
        return {
            unnamedControls,
            smallTargets,
            brokenImages,
            missingAlt,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
        };
    });
    assertAudit(!wcag.unnamedControls.length, `${label} has unnamed controls: ${JSON.stringify(wcag.unnamedControls)}`);
    assertAudit(!wcag.smallTargets.length, `${label} has controls below 24px target size: ${JSON.stringify(wcag.smallTargets)}`);
    assertAudit(!wcag.brokenImages.length, `${label} has broken images: ${JSON.stringify(wcag.brokenImages)}`);
    assertAudit(!wcag.missingAlt.length, `${label} has images without alt text: ${JSON.stringify(wcag.missingAlt)}`);
    assertAudit(!wcag.horizontalOverflow, `${label} has horizontal overflow`);
}

async function main() {
    await mkdir(ARTIFACTS, { recursive: true });
    const server = await startDocsServer(DOCS_DIST);
    const browser = await chromium.launch({ headless: true });
    const results = [];
    try {
        for (const viewport of viewports) {
            await auditDocsViewport(browser, server.origin, viewport, results);
        }
    } finally {
        await browser.close();
        await server.close();
    }

    const failed = results.filter(result => result.status === 'FAIL');
    console.log(`Docs a11y summary: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
}

async function auditDocsViewport(browser, origin, viewport, results) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    try {
        for (const pageDef of pages) {
            await auditDocsPage(context, origin, viewport, pageDef, results);
        }
    } finally {
        await context.close();
    }
}

async function auditDocsPage(context, origin, viewport, pageDef, results) {
    const page = await context.newPage();
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));
    const label = `${pageDef.name} ${viewport.name}`;
    try {
        await page.goto(`${origin}${pageDef.path}`, { waitUntil: 'domcontentloaded' });
        await waitForStablePage(page);
        assertAudit(!errors.length, `${label} console/page errors: ${JSON.stringify(errors)}`);
        await assertDocsAccessibility(page, label);
        await page.screenshot({ path: path.join(ARTIFACTS, `docs-${pageDef.name}-${viewport.name}.png`), fullPage: false });
        results.push({ label, status: 'PASS' });
        console.log(`PASS ${label}`);
    } catch (error) {
        results.push({ label, status: 'FAIL', error: errorMessage(error) });
        console.log(`FAIL ${label} - ${errorMessage(error)}`);
    } finally {
        await page.close();
    }
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

await main();
