#!/usr/bin/env node
// Verify (and optionally upload) protected Academy audio against the
// checked-in allowlist in workers/yomu-academy/media-manifest.json.
//
//   node scripts/academy-audio-media.mjs            # deterministic local verify
//   node scripts/academy-audio-media.mjs --upload   # verify, then upload to R2
//
// Local roots come only from the environment; audio files never live in Git:
//   ACADEMY_PERSONA_AUDIO_ROOT  → sourceCollection "persona"
//   ACADEMY_SHINDAY_SFX_ROOT    → sourceCollection "shinday"
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repoRoot, 'workers/yomu-academy/media-manifest.json');
const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,199}$/;
const ROOT_ENV_BY_COLLECTION = new Map([
    ['persona', 'ACADEMY_PERSONA_AUDIO_ROOT'],
    ['shinday', 'ACADEMY_SHINDAY_SFX_ROOT'],
]);

function fail(message) {
    console.error(`✗ ${message}`);
    process.exit(1);
}

function loadManifest() {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (parsed.version !== 1 || typeof parsed.bucket !== 'string' || !Array.isArray(parsed.objects)) {
        fail('media-manifest.json must have version 1, a bucket, and an objects array.');
    }
    const keys = new Set();
    for (const object of parsed.objects) {
        if (
            typeof object.key !== 'string' || !KEY_PATTERN.test(object.key) || object.key.includes('..')
            || !ROOT_ENV_BY_COLLECTION.has(object.sourceCollection)
            || typeof object.sourceRelativePath !== 'string' || !object.sourceRelativePath
            || typeof object.contentType !== 'string' || !object.contentType
            || !Number.isSafeInteger(object.bytes) || object.bytes <= 0
            || typeof object.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(object.sha256)
        ) {
            fail(`Invalid manifest entry: ${JSON.stringify(object)}`);
        }
        if (keys.has(object.key)) fail(`Duplicate manifest key: ${object.key}`);
        keys.add(object.key);
    }
    return parsed;
}

function localPathFor(entry) {
    const envName = ROOT_ENV_BY_COLLECTION.get(entry.sourceCollection);
    if (!envName) fail(`Unknown source collection for ${entry.key}.`);
    const root = process.env[envName];
    if (!root) fail(`${envName} must be set to verify ${entry.key}.`);
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, entry.sourceRelativePath);
    if (!resolved.startsWith(resolvedRoot + path.sep)) fail(`Source path for ${entry.key} escapes its root.`);
    return resolved;
}

function verifyEntry(entry) {
    const filePath = localPathFor(entry);
    let stats;
    try {
        stats = statSync(filePath);
    } catch {
        fail(`Missing local file for ${entry.key}.`);
    }
    if (stats.size !== entry.bytes) {
        fail(`Size mismatch for ${entry.key}: manifest ${entry.bytes}, local ${stats.size}.`);
    }
    const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
    if (digest !== entry.sha256) fail(`SHA-256 mismatch for ${entry.key}.`);
    console.log(`✓ ${entry.key} (${entry.bytes} bytes)`);
    return filePath;
}

function upload(bucket, entry, filePath) {
    // spawn with an argument vector: filenames and keys are never interpreted
    // by a shell. R2 uploads are independent, so a small bounded pool avoids
    // paying Wrangler startup/network latency 24 times in series.
    return new Promise((resolve, reject) => {
        const child = spawn('npx', [
            'wrangler', 'r2', 'object', 'put', `${bucket}/${entry.key}`,
            '--remote',
            '--file', filePath,
            '--content-type', entry.contentType,
            '--cache-control', 'private, max-age=3600',
            '--config', path.join(repoRoot, 'wrangler.academy.jsonc'),
        ], { stdio: 'inherit', cwd: repoRoot });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error(`Upload failed for ${entry.key} (${signal ?? `exit ${code}`}).`));
        });
    });
}

async function uploadAll(bucket, verified) {
    const concurrency = Math.min(4, verified.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
        while (cursor < verified.length) {
            const item = verified[cursor++];
            await upload(bucket, item.entry, item.filePath);
        }
    }));
}

const shouldUpload = process.argv.includes('--upload');
const unknownFlags = process.argv.slice(2).filter(flag => flag !== '--upload');
if (unknownFlags.length > 0) fail(`Unknown arguments: ${unknownFlags.join(' ')}`);

const manifest = loadManifest();
if (manifest.objects.length === 0) {
    console.log('Manifest is valid and empty — nothing to verify or upload.');
    process.exit(0);
}

const verified = manifest.objects.map(entry => ({ entry, filePath: verifyEntry(entry) }));
console.log(`Verified ${verified.length} object(s) against ${path.relative(repoRoot, manifestPath)}.`);

if (shouldUpload) {
    await uploadAll(manifest.bucket, verified);
    console.log(`Uploaded ${verified.length} object(s) to ${manifest.bucket}.`);
}
