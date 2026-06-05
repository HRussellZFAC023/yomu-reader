#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const JPDB_TEST = join(ROOT, 'tests/reader/jpdb.test.ts');
const SETTINGS_FORM_TEST = join(ROOT, 'tests/reader/settings-form.test.ts');
const GENERATED_DIR = join(ROOT, 'tests/reader/.vitest-jpdb-shards');
const GENERATED_SETTINGS_DIR = join(ROOT, 'tests/reader/.vitest-settings-shards');

const args = parseArgs(process.argv.slice(2));
const kind = args.kind ?? 'regular';
const shard = readPositiveInt(args.shard ?? process.env.CI_TEST_SHARD ?? '1', 'shard');
const total = readPositiveInt(args.total ?? process.env.CI_TEST_TOTAL ?? '1', 'total');
const apiPort = args['api-port'] ?? process.env.YOMU_VITEST_API_PORT ?? '';
if (shard > total) throw new Error(`shard ${shard} cannot be greater than total ${total}`);

if (kind === 'regular' && args.prepare) generateSettingsShardFiles(total);
else if (kind === 'regular') runRegularShard(shard, total, Boolean(args.reuse));
else if (kind === 'jpdb' && args.prepare) generateJpdbShardFiles(total);
else if (kind === 'jpdb') runJpdbShard(shard, total, Boolean(args.reuse));
else throw new Error(`Unknown CI test kind: ${kind}`);

function runRegularShard(currentShard, shardTotal, reuseGenerated = false) {
    const files = collectTestFiles(join(ROOT, 'tests/reader'))
        .filter(file => file !== JPDB_TEST)
        .filter(file => file !== SETTINGS_FORM_TEST)
        .filter(file => !file.includes('/.vitest-jpdb-shards/'))
        .filter(file => !file.includes('/.vitest-settings-shards/'));
    const generatedSettings = reuseGenerated ? existingSettingsShardFiles(shardTotal) : generateSettingsShardFiles(shardTotal);
    const regularBuckets = sizeBalancedBuckets(files, shardTotal, fileSize);
    const filesForShard = [
        ...regularBuckets[currentShard - 1],
        generatedSettings[currentShard - 1],
    ].filter(Boolean);
    const maxWorkers = readPositiveInt(process.env.YOMU_CI_REGULAR_MAX_WORKERS ?? '4', 'YOMU_CI_REGULAR_MAX_WORKERS');
    runVitest([
        'run',
        ...filesForShard.map(file => relative(ROOT, file)),
        '--minWorkers=1',
        `--maxWorkers=${maxWorkers}`,
    ], { YOMU_INCLUDE_GENERATED_SETTINGS_SHARDS: '1' });
}

function runJpdbShard(currentShard, shardTotal, reuseGenerated = false) {
    const generated = reuseGenerated ? existingJpdbShardFiles(shardTotal) : generateJpdbShardFiles(shardTotal);
    runVitest(
        ['run', relative(ROOT, generated[currentShard - 1]), '--minWorkers=1', '--maxWorkers=1', '--no-file-parallelism'],
        { YOMU_INCLUDE_GENERATED_JPDB_SHARDS: '1' },
    );
}

function existingJpdbShardFiles(shardTotal) {
    return existingShardFiles(GENERATED_DIR, 'jpdb.generated', shardTotal, 'JPDB');
}

function existingSettingsShardFiles(shardTotal) {
    return existingShardFiles(GENERATED_SETTINGS_DIR, 'settings-form.generated', shardTotal, 'settings form');
}

function existingShardFiles(generatedDir, filenamePrefix, shardTotal, label) {
    const files = Array.from({ length: shardTotal }, (_, index) => join(generatedDir, `${filenamePrefix}.${index + 1}.test.ts`));
    const missing = files.filter(file => !readableFile(file));
    if (missing.length) {
        throw new Error(`Generated ${label} shard files are missing. Run with --prepare first. Missing: ${missing.map(file => relative(ROOT, file)).join(', ')}`);
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

function generateSettingsShardFiles(shardTotal) {
    return generateItBlockShardFiles({
        sourceFile: SETTINGS_FORM_TEST,
        generatedDir: GENERATED_SETTINGS_DIR,
        filenamePrefix: 'settings-form.generated',
        describeName: 'settings form generated shard',
        tailStartMarker: '\nfunction settingsToken',
        shardTotal,
    });
}

function generateItBlockShardFiles({ sourceFile, generatedDir, filenamePrefix, describeName, tailStartMarker, shardTotal }) {
    rmSync(generatedDir, { recursive: true, force: true });
    mkdirSync(generatedDir, { recursive: true });

    const source = readFileSync(sourceFile, 'utf8');
    const describeStart = source.indexOf('describe(');
    const tailStart = source.indexOf(tailStartMarker);
    if (describeStart === -1 || tailStart === -1 || tailStart <= describeStart) {
        throw new Error(`Could not locate test body in ${relative(ROOT, sourceFile)}`);
    }

    const prelude = rewriteGeneratedImports(source.slice(0, describeStart));
    const body = source.slice(describeStart, tailStart);
    const tail = rewriteGeneratedImports(source.slice(tailStart));
    const blocks = extractIndentedItBlocks(body);
    if (!blocks.length) throw new Error(`No tests found to shard in ${relative(ROOT, sourceFile)}`);

    const shards = contiguousBuckets(blocks, shardTotal);
    return shards.map((blocksForShard, index) => {
        const filename = join(generatedDir, `${filenamePrefix}.${index + 1}.test.ts`);
        const contents = [
            prelude.trimEnd(),
            '',
            `describe('${describeName} ${index + 1}', () => {`,
            ...blocksForShard.map(block => block.trimEnd()),
            '});',
            '',
            tail.trimStart(),
        ].join('\n');
        writeFileSync(filename, contents);
        return filename;
    });
}

function extractIndentedItBlocks(contents) {
    const starts = [...contents.matchAll(/^    it\(/gm)].map(match => match.index ?? 0);
    return starts.map(start => {
        const remaining = contents.slice(start);
        const close = remaining.match(/^    \}\);\s*$/m);
        if (!close || close.index === undefined) {
            throw new Error('Could not locate the end of an indented it(...) block');
        }
        return remaining.slice(0, close.index + close[0].length);
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

function sizeBalancedBuckets(items, count, sizeForItem) {
    const buckets = Array.from({ length: count }, () => ({ size: 0, items: [] }));
    const sorted = [...items].sort((left, right) => sizeForItem(right) - sizeForItem(left));
    for (const item of sorted) {
        const bucket = buckets.reduce((smallest, candidate) => candidate.size < smallest.size ? candidate : smallest, buckets[0]);
        bucket.items.push(item);
        bucket.size += sizeForItem(item);
    }
    return buckets.map(bucket => bucket.items.sort());
}

function fileSize(file) {
    return statSync(file).size;
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
