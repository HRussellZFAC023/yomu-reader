import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

export function chromiumExtensionSmokeConfig(importMetaUrl, artifactDirectoryName) {
    const root = path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '..', '..');
    return {
        root,
        extensionPackage: process.env.EXT_DIR
            || path.join(root, 'dist', 'extension', 'release', 'chrome', 'yomureader.com-chrome.zip'),
        artifactDirectory: process.env.ART_DIR || path.join(root, 'artifacts', artifactDirectoryName),
    };
}

/** Owns the disposable package extraction and browser profile for a smoke run. */
export function createChromiumExtensionSmokeScope() {
    const directories = new Set();
    const createDirectory = prefix => {
        const directory = mkdtempSync(path.join(tmpdir(), prefix));
        directories.add(directory);
        return directory;
    };
    return {
        createDirectory,
        extensionDirectory(source, prefix = 'yomu-chrome-package-') {
            return source.endsWith('.zip')
                ? extractExtensionPackage(source, createDirectory(prefix))
                : path.resolve(source);
        },
        cleanup() {
            for (const directory of directories) rmSync(directory, { recursive: true, force: true });
            directories.clear();
        },
    };
}

function extractExtensionPackage(source, directory) {
    if (!existsSync(source)) throw new Error(`Missing Chrome extension package: ${source}`);
    const entries = unzipSync(new Uint8Array(readFileSync(source)));
    for (const [name, bytes] of Object.entries(entries)) writeArchiveEntry(directory, name, bytes);
    return directory;
}

function writeArchiveEntry(directory, name, bytes) {
    const output = safeArchiveOutput(directory, name);
    if (name.endsWith('/')) {
        mkdirSync(output, { recursive: true });
        return;
    }
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, bytes);
}

function safeArchiveOutput(directory, name) {
    const output = path.resolve(directory, name);
    if (!output.startsWith(`${directory}${path.sep}`)) throw new Error(`Unsafe package path: ${name}`);
    return output;
}
