// Hosted Study with the built userscript installed, as the local-dictionary
// smokes drive it. Since 1.9.1 an ordinary page never shows the settings form
// or its dictionary import (sensitive setup opens on Study), so those smokes
// serve dist/newtab at its real https://yomureader.com URL and import through
// Settings' real file chooser, exactly where a learner does it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createSmokePaths, YOMU_SETTINGS_KEY } from './smoke-harness.mjs';
import { yomitanZipBuffer } from './yomitan-zip.mjs';

const { dist: DIST, newTabDir: NEWTAB_DIR } = createSmokePaths(path.join(import.meta.dirname, '..'));
export const HOSTED_STUDY_URL = 'https://yomureader.com/study/';
export const HOSTED_STUDY_ORIGIN = new URL(HOSTED_STUDY_URL).origin;
const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
};

/** Route handler for `${HOSTED_STUDY_ORIGIN}/**`: Study's own files from the build. */
export async function fulfillHostedStudyAsset(route) {
    const filePath = hostedStudyAssetPath(new URL(route.request().url()).pathname);
    if (!filePath) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
        body: readFileSync(filePath),
    });
}

function hostedStudyAssetPath(pathname) {
    if (pathname === '/study/' || pathname === '/study/index.html') return path.join(NEWTAB_DIR, 'index.html');
    const [base, relative] = pathname.startsWith('/study/')
        ? [NEWTAB_DIR, pathname.slice('/study/'.length)]
        : [DIST, pathname.slice(1)];
    const candidate = path.resolve(base, relative);
    if (!candidate.startsWith(`${path.resolve(base)}${path.sep}`)) return null;
    return existsSync(candidate) ? candidate : null;
}

/**
 * Imports one Yomitan dictionary through the open Settings dialog's import
 * button, and waits for the durable postcondition: the installed Reader's saved
 * settings carry a preference row for `title`.
 */
export async function importYomitanDictionaryThroughSettings(page, { title, terms, gmStoragePrefix, revision = 'smoke-1' }) {
    const importButton = page.locator('.jpdb-reader-settings [data-action="import-yomitan-dictionary"]');
    await importButton.scrollIntoViewIfNeeded();
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
    await importButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
        name: `${title}.zip`,
        mimeType: 'application/zip',
        buffer: yomitanZipBuffer({
            'index.json': { title, format: 3, revision },
            'term_bank_1.json': terms,
        }),
    });
    await page.waitForFunction(({ storageKey, expected }) => {
        const raw = localStorage.getItem(storageKey);
        const parsed = raw == null ? null : JSON.parse(raw);
        return Boolean(parsed?.dictionaryPreferences?.some(row => row.name === expected));
    }, { storageKey: `${gmStoragePrefix}${YOMU_SETTINGS_KEY}`, expected: title }, { timeout: 30_000 });
}

/** Every GM value the smoke's storage bridge holds, keyed by GM name, raw. */
export async function readPrefixedGmValues(page, prefix) {
    return page.evaluate(storagePrefix => Object.fromEntries(Object.keys(localStorage)
        .filter(key => key.startsWith(storagePrefix))
        .map(key => [key.slice(storagePrefix.length), localStorage.getItem(key)])), prefix);
}

/** Copies GM values into the current page's bridge namespace, before Yomu boots. */
export async function writePrefixedGmValues(page, prefix, values) {
    await page.evaluate(({ storagePrefix, entries }) => {
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(`${storagePrefix}${key}`, value);
    }, { storagePrefix: prefix, entries: values });
}

/** Titles in the origin's dictionary store, read from IndexedDB directly. */
export async function readDictionaryStoreTitles(page, dbName) {
    return page.evaluate(async name => {
        const listed = (await indexedDB.databases()).some(database => database.name === name);
        if (!listed) return { database: false, dictionaries: [] };
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            if (!database.objectStoreNames.contains('dictionaryInfo')) return { database: true, dictionaries: [] };
            const titles = await new Promise((resolve, reject) => {
                const request = database.transaction('dictionaryInfo', 'readonly').objectStore('dictionaryInfo').getAllKeys();
                request.onsuccess = () => resolve(request.result.map(String));
                request.onerror = () => reject(request.error);
            });
            return { database: true, dictionaries: titles };
        } finally {
            database.close();
        }
    }, dbName);
}

export function attachSmokeDebugLogging(page, label) {
    if (!process.env.SMOKE_DEBUG) return;
    page.on('console', message => console.error(`[${label}:console]`, message.type(), message.text().slice(0, 300)));
    page.on('pageerror', error => console.error(`[${label}:pageerror]`, error.message.slice(0, 300)));
}
