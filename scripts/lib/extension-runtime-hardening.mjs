import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BACKGROUND_FILE = 'background.js';

const UNSAFE_EXTENSION_EVENT_PATTERNS = [
    [/\bapi\.tabs\.onRemoved\.addListener\(/g, 'api.tabs?.onRemoved?.addListener?.('],
    [/\bapi\.tabs\.onRemoved\.removeListener\(/g, 'api.tabs?.onRemoved?.removeListener?.('],
    [/\bchrome\.tabs\.onRemoved\.addListener\(/g, 'chrome.tabs?.onRemoved?.addListener?.('],
    [/\bchrome\.tabs\.onRemoved\.removeListener\(/g, 'chrome.tabs?.onRemoved?.removeListener?.('],
    [/\bbrowser\.tabs\.onRemoved\.addListener\(/g, 'browser.tabs?.onRemoved?.addListener?.('],
    [/\bbrowser\.tabs\.onRemoved\.removeListener\(/g, 'browser.tabs?.onRemoved?.removeListener?.('],
];

export function hardenExtensionBackgroundSource(source) {
    return UNSAFE_EXTENSION_EVENT_PATTERNS.reduce(
        (current, [pattern, replacement]) => current.replace(pattern, replacement),
        source,
    );
}

export async function hardenGeneratedExtensionBackgrounds(root) {
    const files = await collectBackgroundFiles(root);
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const hardened = hardenExtensionBackgroundSource(source);
        if (hardened !== source) await writeFile(file, hardened);
    }
    return files;
}

async function collectBackgroundFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectBackgroundFiles(file));
        } else if (entry.isFile() && entry.name === BACKGROUND_FILE) {
            files.push(file);
        }
    }
    return files;
}
