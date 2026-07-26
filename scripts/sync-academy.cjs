const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'docs', 'public', 'academy');
const trackedFilesBySource = new Map();
const revisionToken = '__ACADEMY_REVISION__';
const templates = [
    ['public/academy/index.html', 'index.html'],
    ['public/academy/sw.js', 'sw.js'],
];
const learningVoiceCatalogSource = 'public/academy/audio/learning-voice-playback.json';
const learningVoiceCatalog = JSON.parse(fs.readFileSync(path.join(root, learningVoiceCatalogSource), 'utf8'));
if (!Array.isArray(learningVoiceCatalog.entries)) throw new Error('Invalid Academy learning voice catalog.');
const learningVoiceAssetSources = [...new Set(learningVoiceCatalog.entries.map(entry => entry.url))]
    .map(url => {
        if (typeof url !== 'string'
            || !/^\/academy\/audio\/learning-lines\/[a-z0-9][a-z0-9._/-]*\.opus$/u.test(url)
            || url.split('/').includes('..')) {
            throw new Error(`Invalid Academy learning voice asset URL: ${url}`);
        }
        return [`public${url}`, url.slice('/academy/'.length)];
    });
const storyVoiceCatalogSource = 'public/academy/audio/story-voice-playback.json';
const storyVoiceCatalog = JSON.parse(fs.readFileSync(path.join(root, storyVoiceCatalogSource), 'utf8'));
if (storyVoiceCatalog.schema !== 'yomu-academy.story-voice-playback.v1'
    || !Array.isArray(storyVoiceCatalog.entries)) {
    throw new Error('Invalid Academy story voice catalog.');
}
const storyVoiceAssetSources = [...new Set(storyVoiceCatalog.entries.map(entry => entry.url))]
    .map(url => {
        if (typeof url !== 'string'
            || !/^\/academy\/audio\/story-(?:pilot|lines)\/[a-z0-9][a-z0-9._-]*\.opus$/u.test(url)
            || url.split('/').includes('..')) {
            throw new Error(`Invalid Academy story voice asset URL: ${url}`);
        }
        return [`public${url}`, url.slice('/academy/'.length)];
    });
const runtimeSources = [
    ['public/academy/manifest.webmanifest', 'manifest.webmanifest'],
    ['public/academy/art/ACADEMY-ASSET-REGISTRY.json', 'art/ACADEMY-ASSET-REGISTRY.json'],
    ['public/academy/art/ASSET-USAGE.json', 'art/ASSET-USAGE.json'],
    ['public/academy/art/CLASSMATE-SPRITE-INVENTORY.json', 'art/CLASSMATE-SPRITE-INVENTORY.json'],
    ['public/academy/art/SPRITE-BATCH-MANIFEST.json', 'art/SPRITE-BATCH-MANIFEST.json'],
    ['public/academy/art/characters', 'art/characters'],
    ['public/academy/art/protagonists', 'art/protagonists'],
    ['public/academy/art/locations', 'art/locations'],
    ['public/academy/art/events', 'art/events'],
    ['public/academy/art/items', 'art/items'],
    ['public/academy/art/lesson-zero', 'art/lesson-zero'],
    ['public/academy/art/vocabulary-pictographs', 'art/vocabulary-pictographs'],
    ['public/academy/content/vertical-slice', 'content/vertical-slice'],
    ['public/academy/content/lessons', 'content/lessons'],
    ['public/academy/content/curriculum', 'content/curriculum'],
    ['public/academy/content/vocabulary-pictographs.v1.json', 'content/vocabulary-pictographs.v1.json'],
    ['public/academy/content/RESOURCE-LEDGER.json', 'content/RESOURCE-LEDGER.json'],
    ['public/academy/content/audio', 'content/audio'],
    ['public/academy/content/listening', 'content/listening'],
    ['public/academy/content/n1-opening-sequence', 'content/n1-opening-sequence'],
    ['public/academy/content/n1-sound-discrimination', 'content/n1-sound-discrimination'],
    ['public/academy/content/n2-extensive-reading', 'content/n2-extensive-reading'],
    ['public/academy/content/n2-moving-priority-listening', 'content/n2-moving-priority-listening'],
    ['public/academy/content/source-pipeline', 'content/source-pipeline'],
    ['public/academy/audio/lesson-zero', 'audio/lesson-zero'],
    ['public/academy/audio/story-pilot', 'audio/story-pilot'],
    [storyVoiceCatalogSource, 'audio/story-voice-playback.json'],
    ...storyVoiceAssetSources,
    [learningVoiceCatalogSource, 'audio/learning-voice-playback.json'],
    ...learningVoiceAssetSources,
    ['public/academy/vendor', 'vendor'],
    ['dist/academy/app.js', 'app.js'],
    ['dist/academy/style.css', 'style.css'],
];
const hostedDependencies = [
    'docs/public/yomu.user.js',
    'docs/public/yomu.css',
    'docs/public/greasyfork/yomu-ui-copy.user.js',
    'docs/public/greasyfork/yomu-settings-surface.user.js',
    'docs/public/greasyfork/yomu-kanji-study.user.js',
    'docs/public/greasyfork/yomu-anki.user.js',
];

const sourcePaths = [...templates, ...runtimeSources].map(([source]) => source).concat(hostedDependencies);
for (const source of sourcePaths) {
    if (!fs.existsSync(path.join(root, source))) throw new Error(`Missing Academy runtime file: ${source}`);
}
assertNoPrivatePaths(trackedFiles('public/academy').map(file => path.join(root, file)));

const hash = crypto.createHash('sha256');
for (const source of sourcePaths.sort()) hashSource(source, hash);
const revision = `s1-${hash.digest('hex').slice(0, 12)}`;
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
const revisionMarker = path.join(root, 'node_modules', '.cache', 'yomu-academy-sync-revision');
const forceSync = process.env.YOMU_SYNC_ACADEMY_FORCE === '1' || process.env.YOMU_CHECK_RELEASE === '1';
if (!forceSync && fs.existsSync(destination) && fs.existsSync(revisionMarker) && fs.readFileSync(revisionMarker, 'utf8') === revision) {
    console.log(`Academy runtime already synced at ${revision}; skipping copy.`);
    process.exit(0);
}

fs.rmSync(destination, { recursive: true, force: true });
for (const [source, target] of runtimeSources) {
    const from = path.join(root, source);
    const to = path.join(destination, target);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (isTrackedPublicDirectory(source)) copyTrackedDirectory(source, target);
    else fs.cpSync(from, to, { recursive: true });
}
for (const [source, target] of templates) {
    const template = fs.readFileSync(path.join(root, source), 'utf8');
    if (!template.includes(revisionToken)) throw new Error(`Academy template has no revision token: ${source}`);
    const rendered = template.replaceAll(revisionToken, revision);
    const to = path.join(destination, target);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, rendered);
}

fs.mkdirSync(path.dirname(revisionMarker), { recursive: true });
fs.writeFileSync(revisionMarker, revision);
console.log(`Synced ${runtimeSources.length + templates.length} allowlisted Academy runtime entries at ${revision}.`);

function hashPath(label, absolutePath, digest) {
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
        for (const child of fs.readdirSync(absolutePath).sort()) {
            hashPath(`${label}/${child}`, path.join(absolutePath, child), digest);
        }
        return;
    }
    digest.update(label);
    digest.update('\0');
    digest.update(fs.readFileSync(absolutePath));
    digest.update('\0');
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

function hashSource(source, digest) {
    if (!isTrackedPublicDirectory(source)) {
        hashPath(source, path.join(root, source), digest);
        return;
    }
    for (const file of trackedFiles(source)) hashPath(file, path.join(root, file), digest);
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
