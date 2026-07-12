import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Every filesystem root the pipeline touches, resolvable from the environment so
 * tests can point the whole pipeline at generated fixtures. Private outputs must
 * stay inside `artifacts/` (Git-ignored); public outputs are metadata-only.
 */
export const EXTRACTION_REVISION = 'exr-2026-07-12.1';

export const PUBLIC_SCHEMA_VERSIONS = Object.freeze({
    catalog: 'yomu-academy.source-pipeline.catalog/v2',
    corpusStatus: 'yomu-academy.source-pipeline.corpus-status/v1',
    packMigration: 'yomu-academy.source-pipeline.pack-migration-summary/v1',
});

export const PRIVATE_SCHEMA_VERSIONS = Object.freeze({
    ledger: 'yomu-academy.source-pipeline.private-ledger/v1',
    pdfCensus: 'yomu-academy.source-pipeline.pdf-census/v3',
    audioCensus: 'yomu-academy.source-pipeline.audio-census/v1',
    packCandidates: 'yomu-academy.source-pipeline.pack-candidates/v1',
    pairing: 'yomu-academy.source-pipeline.listening-pairing/v1',
});

export const EXPECTED_MANIFEST_SHA256 = '2400b43ef8b022e525272a4e0f2331da09e9ade5f72d7f9a0c70c9e7b1329a78';

export function resolveRoots(env = process.env) {
    const corpusRoot = env.ACADEMY_SOURCE_CORPUS_ROOT
        ?? path.resolve(repoRoot, '../../resources/yomu-academy/moodle-raw');
    const donorPacksRoot = env.ACADEMY_SOURCE_DONOR_PACKS_ROOT
        ?? path.resolve(repoRoot, '../../release-worktrees/yomu-academy-initial-20260711/public/academy/content/worksheet-packs');
    const privateRoot = env.ACADEMY_SOURCE_PRIVATE_ROOT
        ?? path.join(repoRoot, 'artifacts/yomu-academy/source-pipeline');
    const publicRoot = env.ACADEMY_SOURCE_PUBLIC_ROOT
        ?? path.join(repoRoot, 'public/academy/content/source-pipeline');
    assertPrivateRootIsIgnorable(privateRoot, env);
    assertRootsAreSeparated({ repoRoot, privateRoot, publicRoot });
    return Object.freeze({
        repoRoot,
        corpusRoot,
        donorPacksRoot,
        privateRoot,
        publicRoot,
        resourceLedgerPath: path.join(repoRoot, 'public/academy/content/RESOURCE-LEDGER.json'),
    });
}

function assertRootsAreSeparated({ repoRoot, privateRoot, publicRoot }) {
    const trackedPrivateRoots = [
        path.join(repoRoot, 'public'),
        path.join(repoRoot, 'docs', 'public'),
    ];
    if (isWithin(privateRoot, publicRoot) || isWithin(publicRoot, privateRoot)) {
        throw new Error('Private and public pipeline roots must not overlap.');
    }
    if (trackedPrivateRoots.some(root => isWithin(privateRoot, root))) {
        throw new Error(`Private pipeline root must not be inside a tracked public tree: ${privateRoot}`);
    }
}

function isWithin(candidate, root) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertPrivateRootIsIgnorable(privateRoot, env) {
    if (env.ACADEMY_SOURCE_PRIVATE_ROOT) return;
    const relative = path.relative(repoRoot, privateRoot);
    if (relative.startsWith('..') || !relative.startsWith('artifacts' + path.sep)) {
        throw new Error(`Private pipeline root must live under artifacts/: ${privateRoot}`);
    }
}

/** Resolve a child path and refuse anything that escapes the given root. */
export function insideRoot(root, ...segments) {
    const resolved = path.resolve(root, ...segments);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error(`Path escapes its root (${root}): ${segments.join('/')}`);
    }
    return resolved;
}
