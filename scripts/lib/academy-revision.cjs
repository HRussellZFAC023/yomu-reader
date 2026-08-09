// The cache-busting revision the hosted Academy shell stamps into index.html
// and sw.js, plus the exact source set it is computed from.
//
// WHY THIS IS ITS OWN MODULE
//
// Two programs need the same number. scripts/sync-academy.cjs computes it from
// the working tree on its way to writing docs/public/academy, and
// scripts/check-committed-artifacts.mjs recomputes it from the bytes at HEAD to
// prove the committed shell busts its cache for the build that actually sits
// beside it. A second, hand-copied definition of a hash is a definition that
// goes stale -- which is the exact failure this gate exists to catch.
//
// WHY IT IS REPRODUCIBLE WITHOUT A BUILD
//
// Every input has a committed counterpart. dist/academy/app.js and
// dist/academy/style.css are the only two that live outside git, and the sync
// copies them verbatim to docs/public/academy/{app.js,style.css}, so the
// committed hosted file IS the byte string that was hashed. Recomputing with
// that substitution reproduces the stamp exactly from a clean checkout with no
// toolchain -- and without it you get a different number every time your
// node_modules differs from the one that built dist, which is why the revision
// looked unreproducible from a local rebuild.
const crypto = require('node:crypto');

const REVISION_TOKEN = '__ACADEMY_REVISION__';
const REVISION_PATTERN = /s1-[0-9a-f]{12}/;

const TEMPLATES = [
    ['public/academy/index.html', 'index.html'],
    ['public/academy/sw.js', 'sw.js'],
];

const LEARNING_VOICE_CATALOG = 'public/academy/audio/learning-voice-playback.json';
const STORY_VOICE_CATALOG = 'public/academy/audio/story-voice-playback.json';

// Everything ahead of the two voice catalogs, whose asset lists are read out of
// the catalogs themselves. Order is the copy order; the hash sorts separately.
const RUNTIME_SOURCES_HEAD = [
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
];

const RUNTIME_SOURCES_TAIL = [
    ['public/academy/vendor', 'vendor'],
    ['dist/academy/app.js', 'app.js'],
    ['dist/academy/style.css', 'style.css'],
];

// Hashed but not copied: the generated graph already binds the final core and
// every ordered dependency by SRI. The shell therefore has one runtime input
// instead of another hand-maintained list that can drift from userscript
// @require metadata.
const HOSTED_DEPENDENCIES = [
    'docs/public/hosted-runtime-graph.js',
    'docs/public/yomu.css',
];

// The build outputs that are not in git, and the committed file each one is
// copied to byte for byte.
const HOSTED_COUNTERPARTS = new Map([
    ['dist/academy/app.js', 'docs/public/academy/app.js'],
    ['dist/academy/style.css', 'docs/public/academy/style.css'],
]);

/**
 * The [source, target] runtime entries, with the voice assets expanded from the
 * playback catalogs `readJson` hands back.
 */
function academyRuntimeSources(readJson) {
    const learningVoiceCatalog = readJson(LEARNING_VOICE_CATALOG);
    if (!Array.isArray(learningVoiceCatalog?.entries)) throw new Error('Invalid Academy learning voice catalog.');
    const storyVoiceCatalog = readJson(STORY_VOICE_CATALOG);
    if (storyVoiceCatalog?.schema !== 'yomu-academy.story-voice-playback.v1'
        || !Array.isArray(storyVoiceCatalog.entries)) {
        throw new Error('Invalid Academy story voice catalog.');
    }
    return [
        ...RUNTIME_SOURCES_HEAD,
        [STORY_VOICE_CATALOG, 'audio/story-voice-playback.json'],
        ...voiceAssetSources(storyVoiceCatalog, /^\/academy\/audio\/story-(?:pilot|lines)\/[a-z0-9][a-z0-9._-]*\.opus$/u),
        [LEARNING_VOICE_CATALOG, 'audio/learning-voice-playback.json'],
        ...voiceAssetSources(learningVoiceCatalog, /^\/academy\/audio\/learning-lines\/[a-z0-9][a-z0-9._/-]*\.opus$/u),
        ...RUNTIME_SOURCES_TAIL,
    ];
}

function voiceAssetSources(catalog, allowed) {
    return [...new Set(catalog.entries.map(entry => entry.url))].map(url => {
        if (typeof url !== 'string' || !allowed.test(url) || url.split('/').includes('..')) {
            throw new Error(`Invalid Academy voice asset URL: ${url}`);
        }
        return [`public${url}`, url.slice('/academy/'.length)];
    });
}

/** Every path that feeds the revision, in the order it is hashed. */
function academyRevisionSourcePaths(readJson) {
    return [...TEMPLATES, ...academyRuntimeSources(readJson)]
        .map(([source]) => source)
        .concat(HOSTED_DEPENDENCIES)
        .sort();
}

/**
 * `s1-` plus the first 12 hex digits of a sha256 over every source, each file
 * contributing its own path label and then its bytes so a rename is a change.
 *
 * `entries(source)` yields `[label, bytes]` pairs for one source path; the two
 * callers differ only in where the bytes come from (working tree vs HEAD).
 */
function academyRevision(sourcePaths, entries) {
    const digest = crypto.createHash('sha256');
    for (const source of sourcePaths) {
        for (const [label, bytes] of entries(source)) {
            digest.update(label);
            digest.update('\0');
            digest.update(bytes);
            digest.update('\0');
        }
    }
    return `s1-${digest.digest('hex').slice(0, 12)}`;
}

module.exports = {
    HOSTED_COUNTERPARTS,
    HOSTED_DEPENDENCIES,
    REVISION_PATTERN,
    REVISION_TOKEN,
    TEMPLATES,
    academyRevision,
    academyRevisionSourcePaths,
    academyRuntimeSources,
};
