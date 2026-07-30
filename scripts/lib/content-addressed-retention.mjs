import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const RELEASE_RETENTION_COUNT = 40;
export const SUPPORTED_RELEASE_REFS = ['v1.8.2'];
export const RETENTION_MANIFEST_PATH = 'config/ci/content-addressed-retention.json';

const HASHED_COMPANION = /^yomu-[a-z0-9-]+\.[0-9a-f]{12}\.user\.js$/;
const HASHED_READER_CSS = /^yomu\.[0-9a-f]{12}\.css$/;
const COMPANION_URL = /^https:\/\/yomureader\.com\/greasyfork\/(yomu-[a-z0-9-]+\.[0-9a-f]{12}\.user\.js)(?:#|$)/;
const CSS_URL = /^https:\/\/yomureader\.com\/(yomu\.[0-9a-f]{12}\.css)(?:#|$)/;

export function pinnedArtifactPaths(header) {
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

function retainedArtifactPaths(root) {
    if (isShallowRepository(root)) {
        const retained = retainedArtifactPathsFromManifest(root);
        for (const relativePath of ['dist/yomu.user.js', 'docs/public/yomu.user.js']) {
            const absolutePath = join(root, relativePath);
            if (!existsSync(absolutePath)) continue;
            for (const path of pinnedArtifactPaths(readFileSync(absolutePath, 'utf8'))) retained.add(path);
        }
        return retained;
    }
    return retainedArtifactPathsFromHistory(root);
}

export function contentAddressedRetentionManifest(root) {
    return {
        schemaVersion: 1,
        releaseRetentionCount: RELEASE_RETENTION_COUNT,
        supportedReleaseRefs: SUPPORTED_RELEASE_REFS,
        retainedPaths: [...retainedArtifactPathsFromHistory(root)].sort(),
    };
}

export function retentionManifestIsCurrent(root) {
    if (isShallowRepository(root)) return true;
    const actual = readRetentionManifest(root);
    const expected = contentAddressedRetentionManifest(root);
    return JSON.stringify(actual) === JSON.stringify(expected);
}

export function isShallowRepository(root) {
    return git(root, ['rev-parse', '--is-shallow-repository']) === 'true';
}

function retainedArtifactPathsFromHistory(root) {
    const retained = new Set();
    for (const header of supportedHeaders(root)) {
        for (const path of pinnedArtifactPaths(header.code)) retained.add(path);
    }
    return retained;
}

function retainedArtifactPathsFromManifest(root) {
    const manifest = readRetentionManifest(root);
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

export function contentAddressedRetentionReport(root) {
    const artifacts = contentAddressedArtifacts(root);
    const retained = retainedArtifactPaths(root);
    const missing = [...retained].filter(path => !existsSync(join(root, path))).sort();
    const stale = artifacts.filter(path => !retained.has(path));
    return {
        artifacts,
        retained: artifacts.filter(path => retained.has(path)),
        missing,
        stale,
        totalBytes: sumBytes(root, artifacts),
        retainedBytes: sumBytes(root, artifacts.filter(path => retained.has(path))),
        staleBytes: sumBytes(root, stale),
    };
}

function supportedHeaders(root) {
    const headers = [];
    const currentHeaderCodes = new Set();
    for (const relativePath of ['dist/yomu.user.js', 'docs/public/yomu.user.js']) {
        const absolutePath = join(root, relativePath);
        if (existsSync(absolutePath)) {
            const code = readFileSync(absolutePath, 'utf8');
            headers.push({ label: relativePath, code });
            currentHeaderCodes.add(code.trim());
        }
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
    const output = git(root, ['show', spec]);
    return output || null;
}

function sumBytes(root, paths) {
    return paths.reduce((sum, path) => sum + statSync(join(root, path)).size, 0);
}
