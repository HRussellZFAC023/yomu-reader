#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const write = process.argv.includes('--write');
const outputPath = resolve(root, 'docs/academy/audio/learning-voice-local-expected.json');
const catalogPath = resolve(root, 'public/academy/audio/learning-voice-playback.json');
const productionPath = resolve(root, 'docs/academy/audio/learning-voice-production.json');
const distAppPath = resolve(root, 'dist/academy/app.js');
const hostedAppPath = resolve(root, 'docs/public/academy/app.js');
const runtimeSourcePaths = [
    'src/academy/integration/yomu-bridge.ts',
    'src/academy/audio/browser-speech.ts',
    'src/academy/audio/learning-voice.ts',
    'src/academy/audio/worker-tts.ts',
    'src/academy/content/lesson-zero-follow-instructions.ts',
    'src/academy/content/lesson-zero-greeting.ts',
    'src/academy/content/lesson-zero-desk-language.ts',
    'src/academy/content/lesson-zero-vowel-anchors.ts',
    'src/academy/domain/classroom-instruction-session.ts',
    'src/academy/domain/lesson-zero-desk-language-session.ts',
    'src/academy/domain/world-locations.ts',
    'src/academy/routing/lesson-flow.ts',
    'src/academy/routing/world-flow.ts',
    'src/academy/ui/cafe-world.ts',
    'src/academy/ui/classroom-instruction-screen.ts',
    'src/academy/ui/lesson-zero-desk-language-screen.ts',
    'src/academy/ui/lesson-zero-greeting-screen.ts',
    'src/academy/ui/lesson-zero-vowel-screen.ts',
    'src/academy/ui/lesson-zero-vowel-writing-screen.ts',
    'src/academy/ui/lesson-screen.ts',
    'src/academy/ui/world-screen.ts',
];

const catalogSource = await readFile(catalogPath);
const productionSource = await readFile(productionPath);
const distApp = await readFile(distAppPath);
const hostedApp = await readFile(hostedAppPath);
if (!distApp.equals(hostedApp)) throw new Error('Built dist and hosted Academy app bytes differ.');
const catalog = JSON.parse(catalogSource);
const assets = {};
for (const entry of catalog.entries) {
    const asset = await readFile(resolve(root, 'public', entry.url.replace(/^\//u, '')));
    if (sha256(asset) !== entry.assetSha256 || asset.length !== entry.bytes) {
        throw new Error(`Catalog asset lock is stale: ${entry.lineId}`);
    }
    assets[entry.url] = { sha256: entry.assetSha256, bytes: entry.bytes };
}
const runtimeSources = Object.fromEntries(await Promise.all(runtimeSourcePaths.map(async path => (
    [path, sha256(await readFile(resolve(root, path)))]
))));
const expected = {
    schema: 'yomu-academy.learning-voice-local-expected.v1',
    batchId: catalog.batchId,
    scope: 'Immutable expectation for loopback browser proof only; this is not deployment evidence.',
    catalogSha256: sha256(catalogSource),
    productionContractSha256: sha256(productionSource),
    build: {
        distApp: 'dist/academy/app.js',
        hostedApp: 'docs/public/academy/app.js',
        appSha256: sha256(distApp),
        byteParityRequired: true,
    },
    runtimeSources,
    assets,
    acceptedBindingIds: catalog.entries.flatMap(entry => entry.bindings.map(binding => binding.lineId)).sort(),
};
const expectedSource = `${JSON.stringify(expected, null, 2)}\n`;

if (write) {
    await writeFile(outputPath, expectedSource);
    console.log(`Captured immutable local expectation for ${expected.acceptedBindingIds.length} bindings.`);
} else {
    const committed = await readFile(outputPath);
    if (!committed.equals(Buffer.from(expectedSource))) {
        throw new Error('Committed local expectation is stale; run with --write only after a deterministic Academy build.');
    }
    console.log(`Verified immutable local expectation for ${expected.acceptedBindingIds.length} bindings.`);
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
