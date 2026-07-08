#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatDuration, readPositiveInt } from './lib/ci-utils.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const JPDB_TEST = join(ROOT, 'tests/reader/jpdb.test.ts');
const NEW_TAB_REVIEW_TEST = join(ROOT, 'tests/reader/new-tab-review.test.ts');
const SETTINGS_FORM_TEST = join(ROOT, 'tests/reader/settings-form.test.ts');
const SUBTITLES_CONTROLLER_TEST = join(ROOT, 'tests/reader/subtitles-controller.test.ts');
const GENERATED_DIR = join(ROOT, 'tests/reader/.vitest-jpdb-shards');
const GENERATED_NEW_TAB_REVIEW_DIR = join(ROOT, 'tests/reader/.vitest-new-tab-review-shards');
const GENERATED_SETTINGS_DIR = join(ROOT, 'tests/reader/.vitest-settings-shards');
const GENERATED_SUBTITLES_CONTROLLER_DIR = join(ROOT, 'tests/reader/.vitest-subtitles-controller-shards');
const REGULAR_SHARD_DIRECT_EXCLUDES = new Set([JPDB_TEST, NEW_TAB_REVIEW_TEST, SETTINGS_FORM_TEST, SUBTITLES_CONTROLLER_TEST]);
const REGULAR_SHARD_GENERATED_DIRS = [
    '/.vitest-jpdb-shards/',
    '/.vitest-new-tab-review-shards/',
    '/.vitest-settings-shards/',
    '/.vitest-subtitles-controller-shards/',
];

const args = parseArgs(process.argv.slice(2));
const kind = args.kind ?? 'regular';
const shard = readPositiveInt(args.shard ?? process.env.CI_TEST_SHARD ?? '1', 'shard');
const total = readPositiveInt(args.total ?? process.env.CI_TEST_TOTAL ?? '1', 'total');
const apiPort = args['no-api'] ? '' : args['api-port'] ?? process.env.YOMU_VITEST_API_PORT ?? defaultApiPort(kind, shard);
const testTimeoutMs = readPositiveInt(args['timeout-ms'] ?? process.env.YOMU_CI_TEST_TIMEOUT_MS ?? '540000', 'YOMU_CI_TEST_TIMEOUT_MS');
if (shard > total) throw new Error(`shard ${shard} cannot be greater than total ${total}`);

if (kind === 'regular' && args.prepare) {
    generateSettingsShardFiles(total);
    generateNewTabReviewShardFiles(total);
    generateSubtitlesControllerShardFiles(total);
}
else if (kind === 'regular') runRegularShard(shard, total, Boolean(args.reuse));
else if (kind === 'jpdb' && args.prepare) generateJpdbShardFiles(total);
else if (kind === 'jpdb') runJpdbShard(shard, total, Boolean(args.reuse));
else throw new Error(`Unknown CI test kind: ${kind}`);

function runRegularShard(currentShard, shardTotal, reuseGenerated = false) {
    const files = regularShardSourceFiles();
    const generated = regularGeneratedShardFiles(shardTotal, reuseGenerated);
    const regularBuckets = sizeBalancedBuckets(files, shardTotal, fileSize);
    const filesForShard = [
        ...regularBuckets[currentShard - 1],
        ...generated.map(files => files[currentShard - 1]),
    ].filter(Boolean);
    const maxWorkers = readPositiveInt(process.env.YOMU_CI_REGULAR_MAX_WORKERS ?? String(defaultRegularMaxWorkers()), 'YOMU_CI_REGULAR_MAX_WORKERS');
    runVitest(
        [
            'run',
            ...filesForShard.map(file => relative(ROOT, file)),
            '--minWorkers=1',
            `--maxWorkers=${maxWorkers}`,
        ],
        {
            YOMU_INCLUDE_GENERATED_NEW_TAB_REVIEW_SHARDS: '1',
            YOMU_INCLUDE_GENERATED_SETTINGS_SHARDS: '1',
            YOMU_INCLUDE_GENERATED_SUBTITLES_CONTROLLER_SHARDS: '1',
        },
        {
            label: `regular shard ${currentShard}/${shardTotal}`,
            files: filesForShard,
        },
    );
}

// Each regular shard runs its own Vitest process with this many forks. The suite
// launches several shards concurrently (see run-ci-suite.mjs), so the aggregate
// fork count is roughly shardConcurrency * maxWorkers. Sizing workers to
// cores / concurrency keeps that aggregate at or under the core count instead of
// oversubscribing memory-heavy jsdom forks, which is what pushes a slow CI runner
// into thrash and a suite-child timeout under load. Clamp to [2, 4] so a small
// box still gets intra-shard parallelism and a large box does not over-fan a
// setup-bound suite. An explicit YOMU_CI_REGULAR_MAX_WORKERS always wins.
function defaultRegularMaxWorkers() {
    const shardConcurrency = regularShardConcurrency();
    const perShard = Math.floor(availableParallelism() / shardConcurrency);
    return Math.max(2, Math.min(4, perShard));
}

function regularShardConcurrency() {
    const shardTotal = readPositiveInt(process.env.YOMU_CI_REGULAR_SHARDS ?? '4', 'YOMU_CI_REGULAR_SHARDS');
    const fallback = Math.max(1, Math.min(4, shardTotal, availableParallelism()));
    return readPositiveInt(process.env.YOMU_CI_REGULAR_CONCURRENCY ?? String(fallback), 'YOMU_CI_REGULAR_CONCURRENCY');
}

function regularShardSourceFiles() {
    return collectTestFiles(join(ROOT, 'tests/reader')).filter(isRegularShardSourceFile);
}

function isRegularShardSourceFile(file) {
    if (REGULAR_SHARD_DIRECT_EXCLUDES.has(file)) return false;
    return !REGULAR_SHARD_GENERATED_DIRS.some(dir => file.includes(dir));
}

function regularGeneratedShardFiles(shardTotal, reuseGenerated) {
    return [
        reuseGenerated ? existingSettingsShardFiles(shardTotal) : generateSettingsShardFiles(shardTotal),
        reuseGenerated ? existingNewTabReviewShardFiles(shardTotal) : generateNewTabReviewShardFiles(shardTotal),
        reuseGenerated ? existingSubtitlesControllerShardFiles(shardTotal) : generateSubtitlesControllerShardFiles(shardTotal),
    ];
}

function runJpdbShard(currentShard, shardTotal, reuseGenerated = false) {
    const generated = reuseGenerated ? existingJpdbShardFiles(shardTotal) : generateJpdbShardFiles(shardTotal);
    runVitest(
        ['run', relative(ROOT, generated[currentShard - 1]), '--minWorkers=1', '--maxWorkers=1', '--no-file-parallelism'],
        { YOMU_INCLUDE_GENERATED_JPDB_SHARDS: '1' },
        {
            label: `JPDB shard ${currentShard}/${shardTotal}`,
            files: [generated[currentShard - 1]],
        },
    );
}

function existingJpdbShardFiles(shardTotal) {
    return existingShardFiles(GENERATED_DIR, 'jpdb.generated', shardTotal, 'JPDB');
}

function existingNewTabReviewShardFiles(shardTotal) {
    return existingShardFiles(GENERATED_NEW_TAB_REVIEW_DIR, 'new-tab-review.generated', shardTotal, 'new tab review');
}

function existingSettingsShardFiles(shardTotal) {
    return existingShardFiles(GENERATED_SETTINGS_DIR, 'settings-form.generated', shardTotal, 'settings form');
}

function existingSubtitlesControllerShardFiles(shardTotal) {
    return existingShardFiles(GENERATED_SUBTITLES_CONTROLLER_DIR, 'subtitles-controller.generated', shardTotal, 'subtitles controller');
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
    const range = locateJpdbDescribeBlock(source);
    const prelude = rewriteGeneratedImports(source.slice(0, range.describeStart));
    const body = source.slice(range.bodyStart, range.describeEnd);
    const tail = rewriteGeneratedImports(source.slice(range.tailStart));
    const { prefix, blocks } = splitJpdbTestBlocks(body);
    return writeGeneratedShardFiles({
        generatedDir: GENERATED_DIR,
        filenamePrefix: 'jpdb.generated',
        describeName: 'reader helpers',
        prelude,
        prefix,
        blocks,
        tail,
        shardTotal,
        includeShardIndex: false,
    });
}

function locateJpdbDescribeBlock(source) {
    const describeStart = source.indexOf("describe('reader helpers', () => {");
    const describeEnd = source.indexOf('\n});\n\nfunction withWindowProperty');
    assertValidSourceRange(describeStart, describeEnd, 'Could not locate the reader helpers describe block in jpdb.test.ts');
    return {
        describeStart,
        describeEnd,
        bodyStart: source.indexOf('\n', describeStart) + 1,
        tailStart: describeEnd + '\n});\n\n'.length,
    };
}

function splitJpdbTestBlocks(body) {
    const testStartMatches = [...body.matchAll(/^    it\(/gm)];
    assertHasShardBlocks(testStartMatches, 'No JPDB tests found to shard');
    return {
        prefix: body.slice(0, testStartMatches[0].index ?? 0),
        blocks: testStartMatches.map((match, index) => jpdbTestBlock(body, testStartMatches, match, index)),
    };
}

function jpdbTestBlock(body, testStartMatches, match, index) {
    const start = match.index ?? 0;
    const end = testStartMatches[index + 1]?.index ?? body.length;
    return body.slice(start, end);
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

function generateNewTabReviewShardFiles(shardTotal) {
    return generateTopLevelDescribeShardFiles({
        sourceFile: NEW_TAB_REVIEW_TEST,
        generatedDir: GENERATED_NEW_TAB_REVIEW_DIR,
        filenamePrefix: 'new-tab-review.generated',
        describeName: 'new tab review generated shard',
        describeStartText: "describe('new tab review helpers', () => {",
        shardTotal,
    });
}

function generateSubtitlesControllerShardFiles(shardTotal) {
    return generateTopLevelDescribeShardFiles({
        sourceFile: SUBTITLES_CONTROLLER_TEST,
        generatedDir: GENERATED_SUBTITLES_CONTROLLER_DIR,
        filenamePrefix: 'subtitles-controller.generated',
        describeName: 'subtitles controller generated shard',
        describeStartText: "describe('SubtitlePlayerController', () => {",
        shardTotal,
    });
}

function generateTopLevelDescribeShardFiles({ sourceFile, generatedDir, filenamePrefix, describeName, describeStartText, shardTotal }) {
    rmSync(generatedDir, { recursive: true, force: true });
    mkdirSync(generatedDir, { recursive: true });

    const { prelude, body, tail } = readTopLevelDescribeShardSections(sourceFile, describeStartText);
    const { prefix, blocks } = splitIndentedItBlocks(body);
    return writeGeneratedShardFiles({
        generatedDir,
        filenamePrefix,
        describeName,
        prelude,
        prefix,
        blocks: assertHasShardBlocks(blocks, `No tests found to shard in ${relative(ROOT, sourceFile)}`),
        tail,
        shardTotal,
    });
}

function readTopLevelDescribeShardSections(sourceFile, describeStartText) {
    const source = readFileSync(sourceFile, 'utf8');
    const describeStart = source.indexOf(describeStartText);
    const bodyStart = source.indexOf('\n', describeStart) + 1;
    const describeEnd = source.lastIndexOf('\n});');
    assertValidSourceRange(describeStart, describeEnd, `Could not locate top-level describe block in ${relative(ROOT, sourceFile)}`);
    assertValidSourceRange(bodyStart, describeEnd, `Could not locate test body in ${relative(ROOT, sourceFile)}`);
    return {
        prelude: rewriteGeneratedImports(source.slice(0, describeStart)),
        body: source.slice(bodyStart, describeEnd),
        tail: rewriteGeneratedImports(source.slice(describeEnd + '\n});'.length)),
    };
}

function generateItBlockShardFiles({ sourceFile, generatedDir, filenamePrefix, describeName, tailStartMarker, shardTotal }) {
    rmSync(generatedDir, { recursive: true, force: true });
    mkdirSync(generatedDir, { recursive: true });

    const { prelude, body, tail } = readItBlockShardSections(sourceFile, tailStartMarker);
    const blocks = assertHasShardBlocks(
        extractIndentedItBlocks(body),
        `No tests found to shard in ${relative(ROOT, sourceFile)}`,
    );
    return writeGeneratedShardFiles({
        generatedDir,
        filenamePrefix,
        describeName,
        prelude,
        blocks,
        tail,
        shardTotal,
    });
}

function writeGeneratedShardFiles({ generatedDir, filenamePrefix, describeName, prelude, prefix, blocks, tail, shardTotal, includeShardIndex = true }) {
    const shards = contiguousBuckets(blocks, shardTotal);
    return shards.map((blocksForShard, index) => {
        const filename = join(generatedDir, `${filenamePrefix}.${index + 1}.test.ts`);
        const describeTitle = includeShardIndex ? `${describeName} ${index + 1}` : describeName;
        const contents = [
            prelude.trimEnd(),
            '',
            `describe('${describeTitle}', () => {`,
            ...(prefix === undefined ? [] : [prefix.trimEnd()]),
            ...blocksForShard.map(block => block.trimEnd()),
            '});',
            '',
            tail.trimStart(),
        ].join('\n');
        writeFileSync(filename, contents);
        return filename;
    });
}

function readItBlockShardSections(sourceFile, tailStartMarker) {
    const source = readFileSync(sourceFile, 'utf8');
    const describeStart = source.indexOf('describe(');
    const tailStart = source.indexOf(tailStartMarker);
    assertValidSourceRange(describeStart, tailStart, `Could not locate test body in ${relative(ROOT, sourceFile)}`);
    return {
        prelude: rewriteGeneratedImports(source.slice(0, describeStart)),
        body: source.slice(describeStart, tailStart),
        tail: rewriteGeneratedImports(source.slice(tailStart)),
    };
}

function assertValidSourceRange(start, end, message) {
    if (start === -1 || end === -1 || end <= start) throw new Error(message);
}

function assertHasShardBlocks(blocks, message) {
    if (!blocks.length) throw new Error(message);
    return blocks;
}

function extractIndentedItBlocks(contents) {
    return splitIndentedItBlocks(contents).blocks;
}

function splitIndentedItBlocks(contents) {
    const starts = [...contents.matchAll(/^    it\(/gm)].map(match => match.index ?? 0);
    assertHasShardBlocks(starts, 'No indented it(...) blocks found');
    return {
        prefix: contents.slice(0, starts[0]),
        blocks: starts.map(start => extractIndentedItBlock(contents, start)),
    };
}

function extractIndentedItBlock(contents, start) {
    const remaining = contents.slice(start);
    const close = remaining.match(/^    \}\);\s*$/m);
    if (!close || close.index === undefined) {
        throw new Error('Could not locate the end of an indented it(...) block');
    }
    return remaining.slice(0, close.index + close[0].length);
}

function contiguousBuckets(blocks, count) {
    const context = createContiguousBucketContext(blocks, count);
    return Array.from({ length: count }, (_, bucketIndex) => nextContiguousBucket(context, count - bucketIndex));
}

function createContiguousBucketContext(blocks, count) {
    const totalSize = blocks.reduce((sum, block) => sum + block.length, 0);
    return { blocks, nextIndex: 0, targetSize: Math.ceil(totalSize / count) };
}

function nextContiguousBucket(context, remainingBuckets) {
    const bucket = [];
    let bucketSize = 0;
    while (context.nextIndex < context.blocks.length) {
        const remainingBlocks = context.blocks.length - context.nextIndex;
        if (mustReserveBlocksForRemainingBuckets(remainingBlocks, remainingBuckets, bucket)) break;
        const nextBlock = takeNextBlock(context);
        bucket.push(nextBlock);
        bucketSize += nextBlock.length;
        if (bucketReachedTargetSize(bucketSize, context.targetSize, remainingBlocks, remainingBuckets)) break;
    }
    return bucket;
}

function takeNextBlock(context) {
    const block = context.blocks[context.nextIndex];
    context.nextIndex += 1;
    return block;
}

function mustReserveBlocksForRemainingBuckets(remainingBlocks, remainingBuckets, bucket) {
    return remainingBlocks <= remainingBuckets - 1 && bucket.length;
}

function bucketReachedTargetSize(bucketSize, targetSize, remainingBlocks, remainingBuckets) {
    return bucketSize >= targetSize && remainingBlocks > remainingBuckets;
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
        .replaceAll("from './helpers/", "from '../helpers/")
        .replaceAll("from './test-utils'", "from '../test-utils'")
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

function defaultApiPort(testKind, currentShard) {
    const basePort = readPositiveInt(process.env.YOMU_CI_VITEST_API_BASE_PORT ?? '55200', 'YOMU_CI_VITEST_API_BASE_PORT');
    const kindOffset = testKind === 'jpdb' ? 100 : 0;
    return String(basePort + kindOffset + currentShard);
}

function runVitest(vitestArgs, envOverrides = {}, context = {}) {
    const apiArgs = apiPort ? ['--api', String(apiPort)] : [];
    const commandArgs = [join(ROOT, 'node_modules/vitest/vitest.mjs'), ...vitestArgs, ...apiArgs];
    logVitestRun(context, commandArgs);
    const result = spawnSync(process.execPath, commandArgs, {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, ...envOverrides },
        timeout: testTimeoutMs,
    });
    exitWithVitestResult(result, context);
}

function exitWithVitestResult(result, context) {
    const errorStatus = vitestErrorStatus(result.error, context);
    if (errorStatus !== undefined) process.exit(errorStatus);
    if (result.signal) process.exit(vitestSignalStatus(result.signal, context));
    process.exit(result.status ?? 1);
}

function vitestErrorStatus(error, context) {
    if (!error) return undefined;
    if (error.code === 'ETIMEDOUT') return vitestTimeoutStatus(context);
    console.error(`[ci-tests] Failed to run ${context.label ?? 'Vitest shard'}:`);
    console.error(error);
    return 1;
}

function vitestTimeoutStatus(context) {
    console.error(`[ci-tests] ${context.label ?? 'Vitest shard'} timed out after ${formatDuration(testTimeoutMs)}.`);
    logShardFiles(context.files);
    return 124;
}

function vitestSignalStatus(signal, context) {
    console.error(`[ci-tests] ${context.label ?? 'Vitest shard'} exited from signal ${signal}.`);
    return 1;
}

function logVitestRun(context, commandArgs) {
    console.log(`[ci-tests] Running ${context.label ?? 'Vitest shard'} with timeout ${formatDuration(testTimeoutMs)}.`);
    logShardFiles(context.files);
    console.log(`[ci-tests] Command: ${[process.execPath, ...commandArgs].map(shellQuote).join(' ')}`);
}

function logShardFiles(files = []) {
    if (!files.length) return;
    console.log('[ci-tests] Shard files:');
    for (const file of files) {
        console.log(`  - ${relative(ROOT, file)}`);
    }
}

function shellQuote(value) {
    return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function parseArgs(rawArgs) {
    const parsed = {};
    for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index];
        if (!arg.startsWith('--')) continue;
        const parsedArg = readCliArg(rawArgs, index);
        parsed[parsedArg.key] = parsedArg.value;
        if (parsedArg.consumesNext) index += 1;
    }
    return parsed;
}

function readCliArg(rawArgs, index) {
    const keyValue = rawArgs[index].slice(2).split('=');
    const nextValue = rawArgs[index + 1];
    const consumesNext = keyValue.length === 1 && isExplicitCliValue(nextValue);
    return {
        key: keyValue[0],
        value: keyValue.length > 1 ? keyValue.slice(1).join('=') : consumesNext ? nextValue : true,
        consumesNext,
    };
}

function isExplicitCliValue(value) {
    return typeof value === 'string' && !value.startsWith('--');
}
