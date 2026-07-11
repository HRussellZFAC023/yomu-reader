#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const umbrellaRoot = path.resolve(repoRoot, '..', '..');
const options = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(options.source ?? path.join(umbrellaRoot, 'resources/yomu-academy/moodle-raw'));
const statePath = path.resolve(options.state ?? path.join(umbrellaRoot, 'artifacts/yomu-academy/r2-upload-state.json'));
const bucket = options.bucket ?? 'yomu-academy-archive';
const wrangler = path.join(repoRoot, 'node_modules', '.bin', 'wrangler');

const files = await archiveFiles(sourceRoot);
const existingState = await readJson(statePath, { schema: 'yomu-academy.r2-upload.v1', bucket, objects: {} });
const state = existingState.bucket === bucket
    ? existingState
    : { schema: 'yomu-academy.r2-upload.v1', bucket, objects: {} };

let uploaded = 0;
let skipped = 0;
for (const [index, filePath] of files.entries()) {
    const relativePath = path.relative(sourceRoot, filePath).split(path.sep).join('/');
    const key = `raw/${relativePath}`;
    const info = await stat(filePath);
    const sha256 = await fileDigest(filePath);
    const previous = state.objects[key];
    if (previous?.sha256 === sha256 && previous?.bytes === info.size && previous?.status === 'uploaded') {
        skipped += 1;
        printProgress(index + 1, files.length, 'skip', key);
        continue;
    }

    if (options.dryRun) {
        printProgress(index + 1, files.length, 'plan', key);
        continue;
    }

    const result = spawnSync(wrangler, [
        'r2', 'object', 'put', `${bucket}/${key}`,
        '--file', filePath,
        '--remote',
        '--content-type', contentType(filePath),
        '--content-disposition', contentDisposition(path.basename(filePath)),
    ], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 4,
    });
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim().split('\n').slice(-8).join('\n');
        throw new Error(`R2 upload failed for ${key}\n${detail}`);
    }

    state.objects[key] = {
        sha256,
        bytes: info.size,
        sourcePath: relativePath,
        status: 'uploaded',
    };
    await writeJsonAtomic(statePath, state);
    uploaded += 1;
    printProgress(index + 1, files.length, 'put', key);
}

if (!options.dryRun) {
    const manifest = {
        schema: 'yomu-academy.archive.v1',
        bucket,
        source: 'ucl-moodle-canonical-archive',
        objectCount: Object.keys(state.objects).length,
        totalBytes: Object.values(state.objects).reduce((sum, entry) => sum + entry.bytes, 0),
        objects: Object.entries(state.objects)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => ({ key, sha256: entry.sha256, bytes: entry.bytes })),
    };
    const directory = await mkdtemp(path.join(tmpdir(), 'yomu-academy-r2-'));
    const manifestPath = path.join(directory, 'archive-manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(wrangler, [
        'r2', 'object', 'put', `${bucket}/catalog/archive-manifest.json`,
        '--file', manifestPath,
        '--remote',
        '--content-type', 'application/json; charset=utf-8',
        '--content-disposition', 'inline',
    ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 4 });
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Manifest upload failed').trim());
}

console.log(JSON.stringify({ bucket, sourceRoot, objects: files.length, uploaded, skipped, dryRun: options.dryRun }, null, 2));

function parseArgs(args) {
    const values = {};
    for (const arg of args) {
        if (arg === '--dry-run') values.dryRun = true;
        else if (arg.startsWith('--source=')) values.source = arg.slice('--source='.length);
        else if (arg.startsWith('--state=')) values.state = arg.slice('--state='.length);
        else if (arg.startsWith('--bucket=')) values.bucket = arg.slice('--bucket='.length);
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return values;
}

async function archiveFiles(root) {
    const output = [];
    await visit(root, output);
    return output
        .filter(filePath => path.basename(filePath) !== 'manifest.json')
        .sort((left, right) => left.localeCompare(right));
}

async function visit(directory, output) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(filePath, output);
        else if (entry.isFile()) output.push(filePath);
    }
}

async function fileDigest(filePath) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest('hex');
}

function contentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.zip') return 'application/zip';
    if (extension === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (extension === '.doc') return 'application/msword';
    if (extension === '.json') return 'application/json; charset=utf-8';
    return 'application/octet-stream';
}

function contentDisposition(fileName) {
    const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function printProgress(current, total, action, key) {
    console.log(`[${String(current).padStart(String(total).length, ' ')}/${total}] ${action} ${key}`);
}

async function readJson(filePath, fallback) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
        if (error?.code === 'ENOENT') return fallback;
        throw error;
    }
}

async function writeJsonAtomic(filePath, value) {
    const temporary = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, filePath);
}
