import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const RELEASE_RETENTION_COUNT = 40;
// The versions the browser stores actually serve, so their pinned companions are
// never pruned. Measured 2026-08-10: AMO and Chrome Web Store both serve 1.8.88.
// This was pinned to v1.8.2 for months on the belief that only a v*.*.0 tag can
// publish to a store; release.yml's publish_browser_stores input publishes patch
// builds too. Update this only after a store publish is live, then re-run
// `npm run assets:prune`.
export const SUPPORTED_RELEASE_REFS = ['v1.8.88'];
export const RETENTION_MANIFEST_PATH = 'config/ci/content-addressed-retention.json';

const HASHED_COMPANION = /^yomu-[a-z0-9-]+\.[0-9a-f]{12}\.user\.js$/;
const HASHED_READER_CSS = /^yomu\.[0-9a-f]{12}\.css$/;
const COMPANION_URL = /^https:\/\/yomureader\.com\/greasyfork\/(yomu-[a-z0-9-]+\.[0-9a-f]{12}\.user\.js)(?:#|$)/;
const CSS_URL = /^https:\/\/yomureader\.com\/(yomu\.[0-9a-f]{12}\.css)(?:#|$)/;
// Historical object IDs are immutable. Reuse their bytes across the manifest,
// before/after inventory and rollback checks in this invocation; named refs
// remain live so a new commit or moved tag cannot reuse stale header bytes.
const committedHeaders = new Map();

function pinnedArtifactPaths(header) {
    const pinned = new Set();
    for (const line of header.split(/\r?\n/)) {
        const requireValue = line.match(/^\/\/ @require\s+(\S+)/)?.[1];
        const companion = requireValue?.match(COMPANION_URL)?.[1];
        if (companion) pinned.add(`docs/public/greasyfork/${companion}`);

        const resourceValue = line.match(/^\/\/ @resource\s+\S+\s+(\S+)/)?.[1];
        const css = resourceValue?.match(CSS_URL)?.[1];
        if (css) pinned.add(`docs/public/${css}`);
    }
    return pinned;
}

function contentAddressedArtifacts(root) {
    const artifacts = [];
    const companionDirectory = join(root, 'docs', 'public', 'greasyfork');
    if (existsSync(companionDirectory)) {
        for (const name of readdirSync(companionDirectory)) {
            if (HASHED_COMPANION.test(name)) artifacts.push(`docs/public/greasyfork/${name}`);
        }
    }
    const publicDirectory = join(root, 'docs', 'public');
    if (existsSync(publicDirectory)) {
        for (const name of readdirSync(publicDirectory)) {
            if (HASHED_READER_CSS.test(name)) artifacts.push(`docs/public/${name}`);
        }
    }
    return artifacts.sort();
}

// A temporary header can age the oldest prior revision out of the window.
// Undoing that edit makes its pins necessary again. Recover only exact HEAD
// bytes, verified against the immutable filename; unknown pins still fail.
export function restoreRetainedArtifactsFromHead(root, paths) {
    const recovered = new Map();
    for (const path of paths) {
        const name = basename(path);
        const valid = (path === `docs/public/greasyfork/${name}` && HASHED_COMPANION.test(name))
            || (path === `docs/public/${name}` && HASHED_READER_CSS.test(name));
        if (!valid) throw new Error(`Refusing to restore a non-content-addressed artifact: ${path}`);
        let bytes;
        try {
            bytes = execFileSync('git', ['show', `HEAD:${path}`], {
                cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
            });
        } catch { continue; }
        const expected = /\.([0-9a-f]{12})\./.exec(name)[1];
        if (!createHash('sha256').update(bytes).digest('hex').startsWith(expected)) {
            throw new Error(`Committed artifact does not match its content address: ${path}`);
        }
        recovered.set(path, bytes);
    }
    for (const [path, bytes] of recovered) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), bytes);
    }
    return [...recovered.keys()];
}

function retainedArtifactPaths(root, inputs) {
    if (isShallowRepository(root)) {
        const retained = retainedArtifactPathsFromManifest(root, inputs);
        for (const code of Object.values(inputs.headers)) {
            for (const path of pinnedArtifactPaths(code)) retained.add(path);
        }
        return retained;
    }
    return retainedArtifactPathsFromHistory(root, inputs);
}

export function contentAddressedRetentionManifest(root, inputs = captureRetentionInputs(root)) {
    return {
        schemaVersion: 1,
        releaseRetentionCount: RELEASE_RETENTION_COUNT,
        supportedReleaseRefs: SUPPORTED_RELEASE_REFS,
        retainedPaths: [...retainedArtifactPathsFromHistory(root, inputs)].sort(),
    };
}

/**
 * Paths git history requires that the committed manifest does not list.
 *
 * This used to demand byte equality with a freshly computed manifest, which made
 * the gate fail on ordinary release churn: the window is "the latest
 * RELEASE_RETENTION_COUNT release tags", so every release shifts it, the committed
 * file stops matching, and `check:release` went red at its second stage for
 * everyone until somebody ran `npm run assets:prune`. It blocked two multilingual
 * waves and was misdiagnosed once as missing pinned assets (A43).
 *
 * Equality was stricter than the safety property. The manifest exists only as the
 * retention source for SHALLOW checkouts, where git history is unavailable
 * (`retainedArtifactPaths`). So the two directions are not symmetric:
 *
 *   missing from the manifest -> a shallow CI could prune an artifact a published
 *                                userscript still pins by hash. Dangerous, must fail.
 *   extra in the manifest     -> a shallow CI retains a little longer than needed.
 *                                Harmless, and it is what a release naturally leaves
 *                                behind when a tag ages out of the window.
 *
 * So the gate now fails only on the dangerous direction. `assets:prune` remains how
 * the extras get reclaimed, run when someone wants the space rather than as a
 * mandatory step after every release.
 */
export function retentionManifestShortfall(root, inputs = captureRetentionInputs(root)) {
    if (isShallowRepository(root)) return { ok: true, missingFromManifest: [], extraInManifest: [] };
    const actual = inputs.manifest;
    const expected = contentAddressedRetentionManifest(root, inputs);
    const schemaMatches = actual?.schemaVersion === expected.schemaVersion
        && actual.releaseRetentionCount === expected.releaseRetentionCount
        && JSON.stringify(actual.supportedReleaseRefs) === JSON.stringify(expected.supportedReleaseRefs)
        && Array.isArray(actual.retainedPaths);
    if (!schemaMatches) {
        return { ok: false, schemaMismatch: true, missingFromManifest: [], extraInManifest: [] };
    }
    const listed = new Set(actual.retainedPaths);
    const required = new Set(expected.retainedPaths);
    const missingFromManifest = expected.retainedPaths.filter(path => !listed.has(path));
    const extraInManifest = actual.retainedPaths.filter(path => !required.has(path));
    return { ok: missingFromManifest.length === 0, missingFromManifest, extraInManifest };
}

export function isShallowRepository(root) {
    const state = git(root, ['rev-parse', '--is-shallow-repository']);
    if (state !== 'true' && state !== 'false') {
        throw new Error('Cannot read Git retention history; refusing to prune assets.');
    }
    return state === 'true';
}

function retainedArtifactPathsFromHistory(root, inputs) {
    const retained = new Set();
    for (const header of supportedHeaders(root, inputs)) {
        for (const path of pinnedArtifactPaths(header.code)) retained.add(path);
    }
    return retained;
}

function retainedArtifactPathsFromManifest(root, inputs) {
    const manifest = inputs.manifest;
    if (
        manifest?.schemaVersion !== 1
        || manifest.releaseRetentionCount !== RELEASE_RETENTION_COUNT
        || JSON.stringify(manifest.supportedReleaseRefs) !== JSON.stringify(SUPPORTED_RELEASE_REFS)
        || !Array.isArray(manifest.retainedPaths)
    ) {
        throw new Error(
            `Content-addressed retention needs a current ${RETENTION_MANIFEST_PATH} in shallow checkouts.`,
        );
    }
    return new Set(manifest.retainedPaths);
}

function readRetentionManifest(root) {
    const path = join(root, RETENTION_MANIFEST_PATH);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
}

// Freeze working-tree reads before a concurrent build can replace its header.
// History still comes from Git; only these small read-only inputs need copying.
export function captureRetentionInputs(root) {
    const headers = {};
    for (const path of ['dist/yomu.user.js', 'docs/public/yomu.user.js']) {
        if (existsSync(join(root, path))) headers[path] = readFileSync(join(root, path), 'utf8');
    }
    return { headers, manifest: readRetentionManifest(root), sizes: Object.fromEntries(contentAddressedArtifacts(root).map(path => [path, statSync(join(root, path)).size])) };
}

export function contentAddressedRetentionReport(root, inputs = captureRetentionInputs(root)) {
    const artifacts = Object.keys(inputs.sizes).sort();
    const retained = retainedArtifactPaths(root, inputs);
    const missing = [...retained].filter(path => !(path in inputs.sizes)).sort();
    const stale = artifacts.filter(path => !retained.has(path));
    return {
        artifacts,
        retained: artifacts.filter(path => retained.has(path)),
        missing,
        stale,
        totalBytes: sumBytes(inputs, artifacts),
        retainedBytes: sumBytes(inputs, artifacts.filter(path => retained.has(path))),
        staleBytes: sumBytes(inputs, stale),
    };
}

function supportedHeaders(root, inputs) {
    const headers = [];
    const currentHeaderCodes = new Set();
    for (const [relativePath, code] of Object.entries(inputs.headers)) {
        headers.push({ label: relativePath, code });
        currentHeaderCodes.add(code.trim());
    }

    const releaseTags = reachableReleaseTags(root).slice(0, RELEASE_RETENTION_COUNT);
    for (const ref of new Set([...releaseTags, ...SUPPORTED_RELEASE_REFS])) {
        const code = gitShow(root, `${ref}:dist/yomu.user.js`);
        if (code != null) headers.push({ label: ref, code });
    }

    // Tags identify releases, but generated-asset commits can carry a newer
    // content hash under the same version (the current Greasy Fork 1.8.43
    // header differs from tag v1.8.43). Keep the recent committed hosted
    // headers too so the published listing cannot lose its still-pinned files
    // during the release/deploy hand-off.
    for (const header of recentHostedHeaders(root, currentHeaderCodes)) {
        headers.push(header);
    }
    return headers;
}

function reachableReleaseTags(root) {
    const output = git(root, [
        'for-each-ref',
        '--merged=HEAD',
        '--format=%(refname:short)',
        'refs/tags/v*',
    ]);
    return output
        .split(/\r?\n/)
        .filter(tag => /^v\d+\.\d+\.\d+$/.test(tag))
        .sort(compareReleaseTagsDescending);
}

function recentHostedHeaders(root, currentHeaderCodes) {
    const commits = git(root, [
        'log',
        `-${RELEASE_RETENTION_COUNT * 2}`,
        '--format=%H',
        '--',
        'docs/public/yomu.user.js',
    ]).split(/\r?\n/).filter(Boolean);
    const historical = [];
    for (const commit of commits) {
        const code = gitShow(root, `${commit}:docs/public/yomu.user.js`);
        // The working/current header is retained separately. Excluding its
        // committed twin makes "current + 40 prior revisions" stable across
        // the commit that publishes that current header.
        if (code != null && currentHeaderCodes.has(code.trim())) continue;
        historical.push({ label: commit, code });
        if (historical.length === RELEASE_RETENTION_COUNT) break;
    }
    return historical;
}

function compareReleaseTagsDescending(left, right) {
    const a = left.slice(1).split('.').map(Number);
    const b = right.slice(1).split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return b[index] - a[index];
    }
    return 0;
}

function git(root, args) {
    try {
        return execFileSync('git', args, {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 20 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return '';
    }
}

function gitShow(root, spec) {
    const key = /^[0-9a-f]{40,64}:/.test(spec) ? `${root}\0${spec}` : null;
    if (key && committedHeaders.has(key)) return committedHeaders.get(key);
    const output = git(root, ['show', spec]);
    const code = output || null;
    if (key) committedHeaders.set(key, code);
    return code;
}

function sumBytes(inputs, paths) {
    return paths.reduce((sum, path) => sum + inputs.sizes[path], 0);
}
