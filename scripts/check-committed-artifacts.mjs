#!/usr/bin/env node
// Staleness gate for the build output Yomu actually publishes.
//
// WHY THIS READS GIT AND NOT THE WORKING TREE
//
// The check pipeline regenerates these artifacts before anything inspects them:
//
//   build -> sync-docs-userscript -> build:academy -> docs:build -> verify
//
// scripts/sync-docs-userscript.cjs copies dist/newtab into docs/public/study,
// and scripts/build-openapi.mjs rewrites docs/public/api, so by the time
// `npm run verify` compares them they have just been written from the same
// build. A verifier reading the working tree therefore compares fresh bytes
// against fresh bytes and always passes -- it cannot see that the COMMITTED
// copy is stale. That masking is how yomureader.com/study/ kept serving a
// 1.8.14 build under a 1.8.15 release, and why a green check:release still
// left the tree dirty with regenerated artifacts.
//
// `git show HEAD:<path>` cannot be masked. No build step rewrites a commit that
// already exists, so this check answers the same question wherever and whenever
// it runs, in any stage order: does the commit at HEAD ship an artifact set
// that matches its own package.json?
//
// It deliberately does NOT rebuild anything. Every assertion below is a pure
// function of committed bytes, so it needs no toolchain, no node_modules that
// matches the lockfile, and no network -- it cannot flake.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import academyRevisionModule from './lib/academy-revision.cjs';

const {
    HOSTED_COUNTERPARTS,
    REVISION_PATTERN,
    TEMPLATES: ACADEMY_TEMPLATES,
    academyRevision,
    academyRevisionSourcePaths,
} = academyRevisionModule;

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMIT = process.env.YOMU_COMMIT_TO_CHECK || 'HEAD';
const failures = [];

// One `git cat-file --batch` per batch instead of one `git show` per file: the
// Academy runtime is 684 committed files and 400MB, which costs 16s in
// subprocess spawns and 2.5s this way. Batched rather than streamed so the
// reader stays synchronous, and sized so only one batch is resident at a time.
const COMMITTED_BLOB_BATCH = 32;

if (!hasCommit()) {
    console.log('check:artifacts skipped (no commit to read).');
    process.exit(0);
}

const packageVersion = JSON.parse(readCommitted('package.json')).version;

checkStudyVersionStamp();
checkStudyCacheBusting();
checkAcademyShellRevision();
checkPublishedApiVersionStamp();
checkHostedUserscript();
checkPinnedCompanionsAreCommitted();

if (failures.length > 0) {
    console.error(`\n${COMMIT} ships build output that does not match its own sources (package.json ${packageVersion}):\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('\nRegenerate and commit the published artifacts:');
    console.error('  npm run build && node scripts/sync-docs-userscript.cjs && npm run build:academy && npm run docs:build');
    console.error(`  git add -f -- $(node scripts/lib/generated-artifacts.mjs | tr '\\n' ' ')\n`);
    process.exit(1);
}

console.log(`Committed artifacts are current with package.json ${packageVersion}.`);

// The Study app bakes the release version in at build time and shows it in the
// UI, so a stale copy tells every reader the wrong version.
function checkStudyVersionStamp() {
    const app = readCommitted('docs/public/study/app.js');
    if (app === null) {
        failures.push('docs/public/study/app.js is not committed.');
        return;
    }
    const stamped = /const CURRENT_YOMU_VERSION = "([^"]*)"/.exec(app);
    if (!stamped) {
        failures.push('docs/public/study/app.js has no CURRENT_YOMU_VERSION stamp to check.');
        return;
    }
    if (stamped[1] !== packageVersion) {
        failures.push(`docs/public/study/app.js reports version ${stamped[1]}, package.json is ${packageVersion}.`);
    }
}

// The hosted Study route busts its own caches with a hash of the app bundle.
// If the manifest, HTML and service worker disagree with the bytes they sit
// next to, returning readers keep whatever the service worker cached.
function checkStudyCacheBusting() {
    const app = readCommitted('docs/public/study/app.js');
    const styles = readCommitted('docs/public/study/styles.css');
    const versionFile = readCommitted('docs/public/study/version.json');
    const index = readCommitted('docs/public/study/index.html');
    const serviceWorker = readCommitted('docs/public/study/sw.js');
    if (app === null || styles === null || versionFile === null || index === null || serviceWorker === null) {
        failures.push('the committed docs/public/study asset set is incomplete.');
        return;
    }

    const appHash = shortHash(app);
    const cssHash = shortHash(styles);
    let version;
    try {
        version = JSON.parse(versionFile);
    } catch {
        failures.push('docs/public/study/version.json is not valid JSON.');
        return;
    }
    if (version.appHash !== appHash) {
        failures.push(`docs/public/study/version.json appHash ${version.appHash} does not match the committed app.js (${appHash}).`);
    }
    if (version.buildId !== `${packageVersion}-${appHash}`) {
        failures.push(`docs/public/study/version.json buildId ${version.buildId} does not match ${packageVersion}-${appHash}.`);
    }
    if (!index.includes(`./app.js?v=${appHash}`)) {
        failures.push('docs/public/study/index.html does not request the committed app.js hash.');
    }
    if (!index.includes(`./styles.css?v=${cssHash}`)) {
        failures.push('docs/public/study/index.html does not request the committed styles.css hash.');
    }
    if (!serviceWorker.includes(appHash)) {
        failures.push('docs/public/study/sw.js does not know the committed app.js hash, so it will serve a cached build.');
    }
}

// THE ACADEMY SHELL'S CACHE-BUSTING REVISION
//
// The hosted shell stamps a revision into index.html and sw.js; returning
// students keep the cached build until it changes. scripts/sync-academy.cjs
// computes it as a hash over the bytes it is about to publish, so the number
// only ever comes off somebody's workstation -- no CI job rebuilds the Academy,
// and until now nothing checked it, which made the stamp a claim nobody could
// audit. Recomputed from a local rebuild it looks unreproducible, because a
// rebuild on a different dependency tree writes a different dist/academy/app.js.
//
// It is perfectly reproducible from the COMMITTED bytes: the only inputs that
// live outside git are dist/academy/{app.js,style.css}, and the sync copies
// those verbatim to docs/public/academy/, so the committed hosted file is the
// exact byte string that was hashed (see HOSTED_COUNTERPARTS). This recomputes
// it with that substitution and needs no build, no node_modules and no network
// -- the same properties as every other assertion here.
function checkAcademyShellRevision() {
    let expected;
    try {
        const sourcePaths = academyRevisionSourcePaths(readCommittedJson);
        expected = academyRevision(sourcePaths, committedAcademyEntries(sourcePaths));
    } catch (error) {
        failures.push(`the committed Academy runtime cannot be hashed, so its shell revision proves nothing: ${error.message}`);
        return;
    }
    for (const [, target] of ACADEMY_TEMPLATES) {
        const hostedPath = `docs/public/academy/${target}`;
        const rendered = readCommitted(hostedPath);
        if (rendered === null) {
            failures.push(`${hostedPath} is not committed.`);
            continue;
        }
        const stamped = [...new Set(rendered.match(new RegExp(REVISION_PATTERN.source, 'g')) ?? [])];
        if (stamped.length === 0) {
            failures.push(`${hostedPath} carries no Academy revision, so it cannot bust a stale cache.`);
            continue;
        }
        for (const revision of stamped) {
            if (revision === expected) continue;
            failures.push(`${hostedPath} busts its cache with ${revision}, but the committed Academy runtime hashes to ${expected}, so returning students keep the old build.`);
        }
    }
}

/**
 * Reader for `academyRevision`: yields the `[label, bytes]` pairs
 * sync-academy.cjs hashes for one source, out of the commit instead of the
 * working tree. Labels stay the SOURCE path even where the bytes come from the
 * committed counterpart, because the source path is what the producer hashed.
 *
 * One `git ls-tree` for all 121 sources up front, not one per source: the same
 * subprocess-per-item cost that made the naive reader slower than the sync it
 * verifies.
 */
function committedAcademyEntries(sourcePaths) {
    const tree = listCommitted(sourcePaths.map(source => HOSTED_COUNTERPARTS.get(source) ?? source)).sort();
    const files = new Set(tree);
    return function* entries(source) {
        const committedPath = HOSTED_COUNTERPARTS.get(source) ?? source;
        if (files.has(committedPath)) {
            for (const [, bytes] of readCommittedFiles([committedPath])) yield [source, bytes];
            return;
        }
        const under = tree.filter(path => path.startsWith(`${committedPath}/`));
        if (under.length === 0) throw new Error(`${COMMIT} does not carry ${committedPath}`);
        if (!source.startsWith('public/')) {
            // Only public/ directories are hashed file by file under their own
            // git paths; anything else would need a relabelling rule that does
            // not exist yet. Fail loudly rather than hash a directory the wrong
            // way and report a mismatch that is really this reader's fault.
            throw new Error(`${source} is a directory outside public/, which the committed-bytes reader cannot label`);
        }
        yield* readCommittedFiles(under);
    };
}

function readCommittedJson(path) {
    const raw = readCommitted(path);
    if (raw === null) throw new Error(`${COMMIT} does not carry ${path}`);
    return JSON.parse(raw);
}

function* readCommittedFiles(paths) {
    for (let index = 0; index < paths.length; index += COMMITTED_BLOB_BATCH) {
        const batch = paths.slice(index, index + COMMITTED_BLOB_BATCH);
        // `<oid> <type> <size>\n<contents>\n` per request, in request order.
        const blobs = git(['cat-file', '--batch'], { input: `${batch.map(path => `${COMMIT}:${path}`).join('\n')}\n` });
        let offset = 0;
        for (const path of batch) {
            const headerEnd = blobs.indexOf(0x0a, offset);
            const [, type, size] = blobs.toString('utf8', offset, headerEnd).split(' ');
            if (type !== 'blob') throw new Error(`${COMMIT}:${path} is ${type ?? 'missing'}, not a file`);
            const start = headerEnd + 1;
            yield [path, blobs.subarray(start, start + Number(size))];
            offset = start + Number(size) + 1;
        }
    }
}

// docs/public/api is served as the public API contract, version and all.
function checkPublishedApiVersionStamp() {
    for (const path of listCommitted('docs/public/api').filter(file => file.endsWith('.json'))) {
        const raw = readCommitted(path);
        let document;
        try {
            document = JSON.parse(raw);
        } catch {
            continue;
        }
        const declared = document?.info?.version ?? document?.applicationVersion;
        if (typeof declared === 'string' && declared !== packageVersion) {
            failures.push(`${path} publishes version ${declared}, package.json is ${packageVersion}.`);
        }
    }
}

// docs/public/yomu.user.js is the file the install button serves. dist is what
// Greasy Fork gets. They are the same release or somebody gets the other one.
function checkHostedUserscript() {
    const hosted = readCommitted('docs/public/yomu.user.js');
    const built = readCommitted('dist/yomu.user.js');
    if (hosted === null || built === null) {
        failures.push('the committed userscript pair (dist + docs/public) is incomplete.');
        return;
    }
    if (hosted !== built) {
        failures.push('docs/public/yomu.user.js and dist/yomu.user.js are different builds.');
    }
    const declared = /^\/\/ @version\s+(\S+)/m.exec(built);
    if (!declared) {
        failures.push('dist/yomu.user.js has no @version metadata to check.');
    } else if (declared[1] !== packageVersion) {
        failures.push(`dist/yomu.user.js declares @version ${declared[1]}, package.json is ${packageVersion}.`);
    }
}

// The userscript header pins its companions and stylesheet by immutable URL and
// SRI hash. Every one of those URLs is served straight out of docs/public, so a
// pinned file that was never committed is a 404 plus an SRI failure for anyone
// installing -- the exact failure a `git add -u` release misses, because each
// content-addressed companion is a NEW file rather than a modified one.
function checkPinnedCompanionsAreCommitted() {
    const built = readCommitted('dist/yomu.user.js');
    if (built === null) return;
    const headerEnd = built.indexOf('// ==/UserScript==');
    if (headerEnd < 0) {
        failures.push('dist/yomu.user.js has no userscript metadata block.');
        return;
    }
    const pins = built.slice(0, headerEnd).matchAll(/https:\/\/yomureader\.com\/(\S+?)#sha256=(\S+)/g);
    let checked = 0;
    for (const [, hostedPath, expectedHash] of pins) {
        checked += 1;
        const committed = readCommitted(`docs/public/${hostedPath}`, { binary: true });
        if (committed === null) {
            failures.push(`the userscript pins https://yomureader.com/${hostedPath}, but docs/public/${hostedPath} is not committed (install would 404).`);
            continue;
        }
        const actualHash = createHash('sha256').update(committed).digest('base64');
        if (actualHash !== expectedHash) {
            failures.push(`docs/public/${hostedPath} does not match the SRI hash the userscript pins for it.`);
        }
    }
    if (checked === 0) failures.push('dist/yomu.user.js pins no companion URLs; the header is not the shipped build.');
}

// `stderr: 'ignore'`: an absent path is an ANSWER here, not an error, and both
// of these turn it into one. Left alone, git's `fatal: path ... does not exist
// in 'HEAD'` lands in the middle of the report as noise that reads like the
// failure rather than the tidy sentence underneath it.
function hasCommit() {
    try {
        git(['rev-parse', '--verify', COMMIT], { stdio: ['pipe', 'pipe', 'ignore'] });
        return true;
    } catch {
        return false;
    }
}

function readCommitted(path, { binary = false } = {}) {
    try {
        const contents = git(['show', `${COMMIT}:${path}`], { stdio: ['pipe', 'pipe', 'ignore'] });
        return binary ? contents : contents.toString('utf8');
    } catch {
        return null;
    }
}

// `-z`: without it git C-quotes any path with an unusual byte in it, and the
// quoted name would then be read as a literal path that does not exist.
function listCommitted(paths) {
    const pathspecs = Array.isArray(paths) ? paths : [paths];
    return git(['ls-tree', '-r', '--name-only', '-z', COMMIT, '--', ...pathspecs]).toString('utf8').split('\0').filter(Boolean);
}

function git(args, options = {}) {
    return execFileSync('git', args, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024, ...options });
}

function shortHash(contents) {
    return createHash('sha256').update(contents).digest('hex').slice(0, 12);
}
