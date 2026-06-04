#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const JPDB_TEST = join(ROOT, 'tests/reader/jpdb.test.ts');
const GENERATED_DIR = join(ROOT, 'tests/reader/.vitest-jpdb-shards');

const args = parseArgs(process.argv.slice(2));
const kind = args.kind ?? 'regular';
const shard = readPositiveInt(args.shard ?? process.env.CI_TEST_SHARD ?? '1', 'shard');
const total = readPositiveInt(args.total ?? process.env.CI_TEST_TOTAL ?? '1', 'total');
const apiPort = args['api-port'] ?? process.env.YOMU_VITEST_API_PORT ?? defaultApiPort(kind, shard);
if (shard > total) throw new Error(`shard ${shard} cannot be greater than total ${total}`);

if (kind === 'regular') runRegularShard(shard, total);
else if (kind === 'jpdb' && args.prepare) generateJpdbShardFiles(total);
else if (kind === 'jpdb') runJpdbShard(shard, total, Boolean(args.reuse));
else throw new Error(`Unknown CI test kind: ${kind}`);

function runRegularShard(currentShard, shardTotal) {
    const files = collectTestFiles(join(ROOT, 'tests/reader'))
        .filter(file => file !== JPDB_TEST)
        .filter(file => !file.includes('/.vitest-jpdb-shards/'));
    runVitest(['run', ...files.map(file => relative(ROOT, file)), `--shard=${currentShard}/${shardTotal}`]);
}

function runJpdbShard(currentShard, shardTotal, reuseGenerated = false) {
    const generated = reuseGenerated ? existingJpdbShardFiles(shardTotal) : generateJpdbShardFiles(shardTotal);
    runVitest(
        ['run', relative(ROOT, generated[currentShard - 1]), '--minWorkers=1', '--maxWorkers=1', '--no-file-parallelism'],
        { YOMU_INCLUDE_GENERATED_JPDB_SHARDS: '1' },
    );
}

function existingJpdbShardFiles(shardTotal) {
    const files = Array.from({ length: shardTotal }, (_, index) => join(GENERATED_DIR, `jpdb.generated.${index + 1}.test.ts`));
    const missing = files.filter(file => !readableFile(file));
    if (missing.length) {
        throw new Error(`Generated JPDB shard files are missing. Run with --prepare first. Missing: ${missing.map(file => relative(ROOT, file)).join(', ')}`);
    }
    return files;
}

function readableFile(file) {
    try {
        readFileSync(file, 'utf8');
        return true;
    } catch {
        return false;
    }
}

function generateJpdbShardFiles(shardTotal) {
    rmSync(GENERATED_DIR, { recursive: true, force: true });
    mkdirSync(GENERATED_DIR, { recursive: true });

    const source = readFileSync(JPDB_TEST, 'utf8');
    const describeStart = source.indexOf("describe('reader helpers', () => {");
    const describeEndMarker = '\n});\n\nfunction withWindowProperty';
    const describeEnd = source.indexOf(describeEndMarker);
    if (describeStart === -1 || describeEnd === -1 || describeEnd <= describeStart) {
        throw new Error('Could not locate the reader helpers describe block in jpdb.test.ts');
    }

    const bodyStart = source.indexOf('\n', describeStart) + 1;
    const prelude = rewriteGeneratedImports(source.slice(0, describeStart));
    const body = source.slice(bodyStart, describeEnd);
    const tail = rewriteGeneratedImports(source.slice(describeEnd + '\n});\n\n'.length));
    const testStartMatches = [...body.matchAll(/^    it\(/gm)];
    if (!testStartMatches.length) throw new Error('No JPDB tests found to shard');

    const prefix = body.slice(0, testStartMatches[0].index ?? 0);
    const blocks = testStartMatches.map((match, index) => {
        const start = match.index ?? 0;
        const end = testStartMatches[index + 1]?.index ?? body.length;
        return body.slice(start, end);
    });
    const shards = contiguousBuckets(blocks, shardTotal);
    return shards.map((blocksForShard, index) => {
        const filename = join(GENERATED_DIR, `jpdb.generated.${index + 1}.test.ts`);
        const contents = [
            prelude.trimEnd(),
            '',
            "describe('reader helpers', () => {",
            prefix.trimEnd(),
            ...blocksForShard.map(block => block.trimEnd()),
            '});',
            '',
            tail.trimStart(),
        ].join('\n');
        writeFileSync(filename, contents);
        return filename;
    });
}

function contiguousBuckets(blocks, count) {
    const totalSize = blocks.reduce((sum, block) => sum + block.length, 0);
    const targetSize = Math.ceil(totalSize / count);
    const buckets = [];
    let nextIndex = 0;
    for (let bucketIndex = 0; bucketIndex < count; bucketIndex += 1) {
        const remainingBuckets = count - bucketIndex;
        const bucket = [];
        let bucketSize = 0;
        while (nextIndex < blocks.length) {
            const remainingBlocks = blocks.length - nextIndex;
            if (remainingBlocks <= remainingBuckets - 1 && bucket.length) break;
            const nextBlock = blocks[nextIndex];
            bucket.push(nextBlock);
            bucketSize += nextBlock.length;
            nextIndex += 1;
            if (bucketSize >= targetSize && remainingBlocks > remainingBuckets) break;
        }
        buckets.push(bucket);
    }
    return buckets;
}

function rewriteGeneratedImports(contents) {
    return contents
        .replaceAll("from '../../src/", "from '../../../src/")
        .replaceAll("from '../../workers/", "from '../../../workers/")
        .replaceAll("from './zip-fixture'", "from '../zip-fixture'");
}

function collectTestFiles(dir) {
    return readdirSync(dir, { withFileTypes: true })
        .flatMap(entry => {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) return collectTestFiles(fullPath);
            return entry.isFile() && entry.name.endsWith('.test.ts') ? [fullPath] : [];
        })
        .sort();
}

function runVitest(vitestArgs, envOverrides = {}) {
    const apiArgs = apiPort ? ['--api', String(apiPort)] : [];
    const result = spawnSync(process.execPath, [join(ROOT, 'node_modules/vitest/vitest.mjs'), ...vitestArgs, ...apiArgs], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, ...envOverrides },
    });
    process.exit(result.status ?? 1);
}

function defaultApiPort(testKind, currentShard) {
    const base = testKind === 'jpdb' ? 55300 : 55280;
    return String(base + currentShard);
}

function parseArgs(rawArgs) {
    const parsed = {};
    for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index];
        if (!arg.startsWith('--')) continue;
        const keyValue = arg.slice(2).split('=');
        const key = keyValue[0];
        const nextValue = rawArgs[index + 1];
        const hasExplicitNextValue = typeof nextValue === 'string' && !nextValue.startsWith('--');
        const value = keyValue.length > 1 ? keyValue.slice(1).join('=') : hasExplicitNextValue ? nextValue : true;
        parsed[key] = value;
        if (keyValue.length === 1 && hasExplicitNextValue) index += 1;
    }
    return parsed;
}

function readPositiveInt(value, label) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
    return parsed;
}
