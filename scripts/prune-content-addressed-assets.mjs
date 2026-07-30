#!/usr/bin/env node
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    RELEASE_RETENTION_COUNT,
    RETENTION_MANIFEST_PATH,
    SUPPORTED_RELEASE_REFS,
    contentAddressedRetentionManifest,
    contentAddressedRetentionReport,
    isShallowRepository,
    retentionManifestIsCurrent,
} from './lib/content-addressed-retention.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
if (write === check) {
    console.error('Usage: node scripts/prune-content-addressed-assets.mjs --check|--write');
    process.exit(2);
}

const shallow = isShallowRepository(ROOT);
if (!shallow && write) {
    writeFileSync(
        join(ROOT, RETENTION_MANIFEST_PATH),
        `${JSON.stringify(contentAddressedRetentionManifest(ROOT), null, 2)}\n`,
    );
}
if (!shallow && check && !retentionManifestIsCurrent(ROOT)) {
    console.error(
        `[content-retention] FAIL: ${RETENTION_MANIFEST_PATH} does not match the current retention history. `
        + 'Run npm run assets:prune.',
    );
    process.exit(1);
}

const before = contentAddressedRetentionReport(ROOT);
if (before.missing.length > 0) {
    console.error(`[content-retention] ${before.missing.length} supported pinned artifact(s) are missing:`);
    for (const path of before.missing) console.error(`  ${path}`);
    process.exit(1);
}

if (write) {
    for (const path of before.stale) rmSync(join(ROOT, path));
    const after = contentAddressedRetentionReport(ROOT);
    console.log(
        `[content-retention] pruned ${format(before.stale.length)} files / ${format(before.staleBytes)} bytes; `
        + `${format(before.artifacts.length)} files / ${format(before.totalBytes)} bytes -> `
        + `${format(after.artifacts.length)} files / ${format(after.totalBytes)} bytes.`,
    );
    printPolicy();
    process.exit(0);
}

if (before.stale.length > 0) {
    console.error(
        `[content-retention] FAIL: ${format(before.stale.length)} unreferenced content-addressed files `
        + `consume ${format(before.staleBytes)} bytes. Run npm run assets:prune.`,
    );
    for (const path of before.stale.slice(0, 20)) console.error(`  ${path}`);
    if (before.stale.length > 20) console.error(`  ... ${format(before.stale.length - 20)} more`);
    printPolicy();
    process.exit(1);
}

console.log(
    `[content-retention] PASS: ${format(before.retained.length)} referenced files / `
    + `${format(before.retainedBytes)} bytes retained.`,
);
printPolicy();

function printPolicy() {
    console.log(
        `[content-retention] policy: current built + hosted headers, latest ${RELEASE_RETENTION_COUNT} release tags, `
        + `${RELEASE_RETENTION_COUNT} recent hosted headers, and ${SUPPORTED_RELEASE_REFS.join(', ')} `
        + `(source: ${shallow ? RETENTION_MANIFEST_PATH : 'git history'}).`,
    );
}

function format(value) {
    return value.toLocaleString('en-US');
}
