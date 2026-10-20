#!/usr/bin/env node
// Mechanism fixture: an HTTP failure at the desktop OCR transport boundary.
// The image is the recorded Wikipedia sign; no screenshot or image leaves
// loopback. This asserts request/failure semantics, not visual acceptance.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { imageSize } from './lib/recorded-media.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const product = process.argv.find(arg => arg.startsWith('--product='))?.slice('--product='.length) ?? 'worktree';
assert(product === 'worktree' || /^v\d+\.\d+\.\d+$/u.test(product), 'Expected worktree or a release tag');
const source = product === 'worktree'
    ? readFileSync(path.join(root, 'src/gaming/ocr.ts'), 'utf8')
    : execFileSync('git', ['show', `${product}:src/gaming/ocr.ts`], { cwd: root, encoding: 'utf8' });
const out = path.join(root, 'artifacts', 'gaming-ocr-failure-mechanism-fixture');
mkdirSync(out, { recursive: true });
const bundle = path.join(out, `${product}.mjs`);
await build({ stdin: { contents: source, resolveDir: path.join(root, 'src/gaming'), sourcefile: 'ocr.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: bundle });
const { requestGamingOcr } = await import(pathToFileURL(bundle).href);

const recording = path.join(root, 'scripts/fixtures/recorded/ja-wikipedia-nihongo');
const har = JSON.parse(readFileSync(path.join(recording, 'network.har'), 'utf8'));
const photo = har.log.entries.find(entry => entry.request.url.includes('Welcome_board') && entry.response.content.mimeType.startsWith('image/'));
assert(photo, 'The recorded sign is present');
const bytes = readFileSync(path.join(recording, photo.response.content._file));
const [width, height] = imageSize(bytes);
const server = createServer((request, response) => {
    request.resume();
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end('{"error":"OCR failure mechanism fixture"}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    return originalFetch(`http://127.0.0.1:${server.address().port}/provider`, options);
};
try {
    const result = await requestGamingOcr({ provider: 'google-lens', endpointUrl: '', imageDataUrl: `data:${photo.response.content.mimeType};base64,${bytes.toString('base64')}`, width, height, engine: 'auto', language: 'ja' });
    console.log(JSON.stringify({ product, requests: calls.map(url => new URL(url).hostname + new URL(url).pathname), ok: result.ok, error: result.error }));
    assert.equal(result.ok, false, 'An HTTP failure remains a failure');
    assert.equal(calls.length, 1, 'A failed Lens request must not upload the image again');
    assert.equal(new URL(calls[0]).hostname, 'lensfrontend-pa.googleapis.com');
    assert(!calls.some(url => new URL(url).pathname === '/v3/upload'), 'The retired web upload is never requested');
    console.log(`PASS ${product} desktop Lens failure: one RPC, no web upload`);
} finally {
    globalThis.fetch = originalFetch;
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await closed;
}
