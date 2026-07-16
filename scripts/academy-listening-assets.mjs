#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = path.resolve(repoRoot, '../..');
const crosswalkPath = path.join(repoRoot, 'public/academy/content/listening/listening-crosswalk.v1.json');

function main() {
    const crosswalk = JSON.parse(readFileSync(crosswalkPath, 'utf8'));
    const entries = crosswalk.entries.filter(entry => entry.availability === 'source-verified' && entry.delivery?.mode === 'packaged-static');
    for (const entry of entries) {
        const sourcePath = path.resolve(monorepoRoot, entry.source.repositoryRelativePath);
        const bytes = readFileSync(sourcePath);
        if (statSync(sourcePath).size !== entry.source.bytes || sha256(bytes) !== entry.source.sha256) {
            throw new Error(`Source integrity mismatch for ${entry.locator}.`);
        }
        if (!/^\/academy\/content\/listening\/media\/[a-z0-9-]+\.mp3$/u.test(entry.delivery.url)) {
            throw new Error(`Unsafe packaged listening URL for ${entry.locator}.`);
        }
        for (const root of ['public', 'docs/public']) {
            const destination = path.join(repoRoot, root, entry.delivery.url);
            mkdirSync(path.dirname(destination), { recursive: true });
            copyFileSync(sourcePath, destination);
        }
    }
    process.stdout.write(`[listening-assets] packaged ${entries.length} verified MP3 file(s)\n`);
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

main();
