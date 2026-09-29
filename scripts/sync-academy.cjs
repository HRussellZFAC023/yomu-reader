const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { BUILD_MANIFEST, renderAcademyTemplate, academyEmittedFilesMatch } = require('./lib/academy-build-manifest.cjs');
// The source set and the digest formula live in the shared module so that
// scripts/check-committed-artifacts.mjs can recompute this exact number from
// the bytes at HEAD. Two copies of a hash definition is one copy that rots.
const {
    REVISION_TOKEN: revisionToken,
    TEMPLATES: templates,
    academyRevision,
    academyRevisionSourcePaths,
    academyRuntimeSources,
} = require('./lib/academy-revision.cjs');

const root = path.resolve(__dirname, '..');
const destination = process.env.YOMU_ACADEMY_OUTPUT_DIR ? proofDirectory(process.env.YOMU_ACADEMY_OUTPUT_DIR) : path.join(root, 'docs', 'public', 'academy');
const buildDirectory = process.env.YOMU_ACADEMY_BUILD_DIR ? proofDirectory(process.env.YOMU_ACADEMY_BUILD_DIR) : path.join(root, 'dist/academy');
const trackedFilesBySource = new Map();
const sourceFile = source => source.startsWith('dist/academy/') ? path.join(buildDirectory, source.slice('dist/academy/'.length)) : path.join(root, source);
const readJson = source => JSON.parse(fs.readFileSync(sourceFile(source), 'utf8'));
const runtimeSources = academyRuntimeSources(readJson);
const sourcePaths = academyRevisionSourcePaths(readJson);
for (const source of sourcePaths) {
    if (!fs.existsSync(sourceFile(source))) throw new Error(`Missing Academy runtime file: ${source}`);
}
assertNoPrivatePaths(trackedFiles('public/academy').map(file => path.join(root, file)));

const revision = academyRevision(sourcePaths, workingTreeEntries);
if (process.env.YOMU_SYNC_ACADEMY_REVISION_ONLY === '1') {
    console.log(revision);
    process.exit(0);
}

// The full sync rm+cp moves ~220MB; when the destination was already produced
// from byte-identical sources (revision marker matches), skip it. The revision
// is content-derived, so any source change forces a real sync. Force with
// YOMU_SYNC_ACADEMY_FORCE=1 (check:release sets it).
// The marker lives OUTSIDE the destination so it never ships with the site;
// the destination-existence check keeps a stale marker from skipping a sync
// after the destination was deleted.
const revisionMarker = process.env.YOMU_ACADEMY_OUTPUT_DIR ? `${destination}.revision` : path.join(root, 'node_modules', '.cache', 'yomu-academy-sync-revision');
const forceSync = process.env.YOMU_SYNC_ACADEMY_FORCE === '1' || process.env.YOMU_CHECK_RELEASE === '1';
if (!forceSync && fs.existsSync(destination) && fs.existsSync(revisionMarker) && fs.readFileSync(revisionMarker, 'utf8') === revision && generatedDeliveryMatches()) {
    console.log(`Academy runtime already synced at ${revision}; skipping copy.`);
    process.exit(0);
}

fs.rmSync(destination, { recursive: true, force: true });
for (const [source, target] of runtimeSources) {
    const from = sourceFile(source);
    const to = path.join(destination, target);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (isTrackedPublicDirectory(source)) copyTrackedDirectory(source, target);
    else fs.cpSync(from, to, { recursive: true });
}
for (const [source, target] of templates) {
    const template = fs.readFileSync(path.join(root, source), 'utf8');
    if (!template.includes(revisionToken)) throw new Error(`Academy template has no revision token: ${source}`);
    const rendered = renderAcademyTemplate(template, revision, readJson(BUILD_MANIFEST));
    const to = path.join(destination, target);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, rendered);
}

fs.mkdirSync(path.dirname(revisionMarker), { recursive: true });
fs.writeFileSync(revisionMarker, revision);
console.log(`Synced ${runtimeSources.length + templates.length} allowlisted Academy runtime entries at ${revision}.`);

// `[label, bytes]` for one source, read out of the working tree. Tracked
// public/ directories come from the git index so untracked scratch files can
// never reach the published site or move the revision.
function* workingTreeEntries(source) {
    if (isTrackedPublicDirectory(source)) {
        for (const file of trackedFiles(source)) yield [file, fs.readFileSync(path.join(root, file))];
        return;
    }
    yield* walk(source, sourceFile(source));
}

function* walk(label, absolutePath) {
    if (fs.statSync(absolutePath).isDirectory()) {
        for (const child of fs.readdirSync(absolutePath).sort()) {
            yield* walk(`${label}/${child}`, path.join(absolutePath, child));
        }
        return;
    }
    yield [label, fs.readFileSync(absolutePath)];
}

function trackedFiles(source) {
    const cached = trackedFilesBySource.get(source);
    if (cached) return cached;
    const files = execFileSync('git', ['ls-files', '-z', '--', source], {
        cwd: root,
        encoding: 'utf8',
    }).split('\0').filter(Boolean).sort();
    trackedFilesBySource.set(source, files);
    return files;
}

function isTrackedPublicDirectory(source) {
    return source.startsWith('public/') && fs.statSync(path.join(root, source)).isDirectory();
}

function copyTrackedDirectory(source, target) {
    for (const file of trackedFiles(source)) {
        const relative = path.relative(source, file);
        const to = path.join(destination, target, relative);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(path.join(root, file), to);
    }
}

function assertNoPrivatePaths(files) {
    const privatePath = /(?:\/Users\/[^/]+\/|\/home\/[^/]+\/|[A-Za-z]:\\\\Users\\\\[^\\]+\\\\)/;
    const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.txt', '.webmanifest']);
    for (const current of files) {
        if (!textExtensions.has(path.extname(current))) continue;
        if (privatePath.test(fs.readFileSync(current, 'utf8'))) {
            throw new Error(`Academy runtime contains a private workstation path: ${path.relative(root, current)}`);
        }
    }
}

function proofDirectory(value) {
    const resolved = path.resolve(root, value);
    if (!resolved.startsWith(`${path.join(root, 'artifacts')}${path.sep}`)) throw new Error('Academy proof overrides must stay under artifacts/.');
    return resolved;
}

function generatedDeliveryMatches() {
    const read = file => fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null;
    if (!academyEmittedFilesMatch(readJson(BUILD_MANIFEST), file => read(path.join(buildDirectory, file)), file => read(path.join(destination, file)))) return false;
    return templates.every(([source, target]) => {
        const hosted = read(path.join(destination, target));
        const expected = renderAcademyTemplate(fs.readFileSync(path.join(root, source), 'utf8'), revision, readJson(BUILD_MANIFEST));
        return hosted !== null && hosted.toString('utf8') === expected;
    });
}
