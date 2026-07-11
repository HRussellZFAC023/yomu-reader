#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VISUAL_SOURCE_CATALOG_SCHEMA = 'yomu-academy-visual-source-catalog/v1';
export const LESSON_ART_SIDECAR_SCHEMA = 'yomu-academy-lesson-art-sidecar/v1';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const umbrellaRoot = resolve(projectRoot, '..', '..');
const DEFAULT_ART_ROOT = join(projectRoot, 'public', 'academy', 'art', 'lessons');
const DEFAULT_OUTPUT = join(DEFAULT_ART_ROOT, 'manifest.json');
const DEFAULT_MOODLE_RAW = join(umbrellaRoot, 'resources', 'yomu-academy', 'moodle-raw', 'manifest.json');
const DEFAULT_PUBLISHABLE_CATALOG = join(projectRoot, 'public', 'academy', 'catalog.json');
const DEFAULT_CORPUS_INVENTORY = join(projectRoot, 'docs', 'academy', 'research', '04-corpus-inventory.md');
const DEFAULT_SOYA_ROOT = join(umbrellaRoot, 'references', 'soya-research');
const DEFAULT_JAPANESE_ROOT = '/Users/heru/Documents/Japanese';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const LESSON_SOURCE_EXTENSIONS = new Set(['.pdf', '.docx', '.mp3', '.m4a', '.wav', '.ogg', '.png', '.jpg', '.jpeg', '.webp']);
const GENKI_EXTENSIONS = new Set(['.html', '.mp3']);
const SUBTITLE_EXTENSIONS = new Set(['.vtt', '.srt', '.ass']);
const CONTACT_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/[^\s"')]+/gi;

const USAGE = [
    'Usage: node scripts/build-academy-visual-catalog.mjs [options]',
    '',
    'Options:',
    '  --output <file>                JSON catalog output. Defaults to public/academy/art/lessons/manifest.json',
    '  --art-root <dir>               Lesson art directory to catalog.',
    '  --moodle-raw <file>            Raw Moodle manifest.',
    '  --publishable-catalog <file>   Privacy-safe Moodle archive catalog.',
    '  --corpus-inventory <file>      Human corpus inventory used as a source-audit checksum.',
    '  --japanese-root <dir>          Local Japanese learning library root.',
    '  --soya-root <dir>              Soya research mirror root.',
    '  --print-summary                Print summary JSON after writing.',
].join('\n');

class VisualCatalogError extends Error {}

export function parseArguments(argv) {
    const options = {
        output: DEFAULT_OUTPUT,
        artRoot: DEFAULT_ART_ROOT,
        moodleRaw: DEFAULT_MOODLE_RAW,
        publishableCatalog: DEFAULT_PUBLISHABLE_CATALOG,
        corpusInventory: DEFAULT_CORPUS_INVENTORY,
        japaneseRoot: DEFAULT_JAPANESE_ROOT,
        soyaRoot: DEFAULT_SOYA_ROOT,
        printSummary: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const option = argv[index];
        if (option === '--help') return { help: true };
        if (option === '--print-summary') {
            options.printSummary = true;
            continue;
        }

        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
            throw new VisualCatalogError(`${option} requires a value.`);
        }

        if (option === '--output') options.output = value;
        else if (option === '--art-root') options.artRoot = value;
        else if (option === '--moodle-raw') options.moodleRaw = value;
        else if (option === '--publishable-catalog') options.publishableCatalog = value;
        else if (option === '--corpus-inventory') options.corpusInventory = value;
        else if (option === '--japanese-root') options.japaneseRoot = value;
        else if (option === '--soya-root') options.soyaRoot = value;
        else throw new VisualCatalogError(`Unsupported option: ${option}`);

        index += 1;
    }

    return Object.fromEntries(
        Object.entries(options).map(([key, value]) => [
            key,
            typeof value === 'string' ? resolve(value) : value,
        ]),
    );
}

export async function buildAcademyVisualCatalog(input = {}) {
    const options = {
        output: resolve(input.output ?? DEFAULT_OUTPUT),
        artRoot: resolve(input.artRoot ?? DEFAULT_ART_ROOT),
        moodleRaw: resolve(input.moodleRaw ?? DEFAULT_MOODLE_RAW),
        publishableCatalog: resolve(input.publishableCatalog ?? DEFAULT_PUBLISHABLE_CATALOG),
        corpusInventory: resolve(input.corpusInventory ?? DEFAULT_CORPUS_INVENTORY),
        japaneseRoot: resolve(input.japaneseRoot ?? DEFAULT_JAPANESE_ROOT),
        soyaRoot: resolve(input.soyaRoot ?? DEFAULT_SOYA_ROOT),
    };

    const [
        selectedAssets,
        moodleRawAudit,
        publishableCatalogAudit,
        japaneseLibraryAudit,
        soyaAudit,
        corpusInventoryAudit,
    ] = await Promise.all([
        scanSelectedAssets(options.artRoot),
        auditMoodleRaw(options.moodleRaw),
        auditPublishableCatalog(options.publishableCatalog),
        auditJapaneseLibrary(options.japaneseRoot),
        auditSoyaResearch(options.soyaRoot),
        auditTextSource(options.corpusInventory, 'academy-corpus-inventory'),
    ]);

    const catalog = {
        schema: VISUAL_SOURCE_CATALOG_SCHEMA,
        catalogId: 'yomu-academy-lesson-visuals-initial',
        deterministicBuild: {
            script: 'scripts/build-academy-visual-catalog.mjs',
            timePolicy: 'no wall-clock timestamps are emitted; source hashes and sorted paths define freshness',
        },
        rightsPolicy: {
            publicLessonArt: 'cleared-original-or-explicitly-licensed-only',
            archiveMaterial: 'metadata-only-until-cleared',
            copiedSetLimit: 'small representative set; do not bulk-copy course archives or mirrors',
            excludedData: [
                'absolute private filesystem paths',
                'email addresses',
                'phone numbers',
                'private Moodle member names',
                'raw archive bytes',
                'irrelevant binaries',
            ],
        },
        sourceAudits: {
            moodleRaw: moodleRawAudit,
            moodlePublishableCatalog: publishableCatalogAudit,
            japaneseLibrary: japaneseLibraryAudit,
            soyaResearch: soyaAudit,
            corpusInventory: corpusInventoryAudit,
        },
        selectedAssets,
        reusableSignals: buildReusableSignals(moodleRawAudit, japaneseLibraryAudit, soyaAudit),
        derivativeWorkflows: buildDerivativeWorkflows(),
        productionBriefs: buildProductionBriefs(),
    };

    assertNoPrivateLeak(catalog);
    return catalog;
}

export async function writeAcademyVisualCatalog(input = {}) {
    const options = {
        output: resolve(input.output ?? DEFAULT_OUTPUT),
        artRoot: resolve(input.artRoot ?? DEFAULT_ART_ROOT),
        moodleRaw: resolve(input.moodleRaw ?? DEFAULT_MOODLE_RAW),
        publishableCatalog: resolve(input.publishableCatalog ?? DEFAULT_PUBLISHABLE_CATALOG),
        corpusInventory: resolve(input.corpusInventory ?? DEFAULT_CORPUS_INVENTORY),
        japaneseRoot: resolve(input.japaneseRoot ?? DEFAULT_JAPANESE_ROOT),
        soyaRoot: resolve(input.soyaRoot ?? DEFAULT_SOYA_ROOT),
    };
    const catalog = await buildAcademyVisualCatalog(options);

    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(catalog, null, 2)}\n`);
    return catalog;
}

export async function runCli(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
    try {
        const options = parseArguments(argv);
        if (options.help) {
            stdout.write(`${USAGE}\n`);
            return null;
        }

        const catalog = await writeAcademyVisualCatalog(options);
        if (options.printSummary) {
            stdout.write(`${JSON.stringify({
                schema: catalog.schema,
                selectedAssetCount: catalog.selectedAssets.length,
                sourceAudits: Object.fromEntries(
                    Object.entries(catalog.sourceAudits).map(([key, value]) => [key, value.status]),
                ),
            }, null, 2)}\n`);
        }
        return catalog;
    } catch (error) {
        stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
        return null;
    }
}

async function scanSelectedAssets(artRoot) {
    const files = await listFiles(artRoot, { extensions: IMAGE_EXTENSIONS, maxDepth: 4 });
    const imageFiles = files.filter(file => !file.endsWith('.meta.json')).sort(compareStrings);
    const assets = [];

    for (const file of imageFiles) {
        const relativeFile = toPosix(relative(artRoot, file));
        const sidecarPath = `${file}.meta.json`;
        const sidecar = await readJsonIfExists(sidecarPath);
        if (!sidecar) {
            throw new VisualCatalogError(`Missing sidecar metadata for lesson art: ${relativeFile}`);
        }
        if (sidecar.schema !== LESSON_ART_SIDECAR_SCHEMA) {
            throw new VisualCatalogError(`Unsupported sidecar schema for lesson art: ${relativeFile}`);
        }
        if (sidecar.file !== relativeFile) {
            throw new VisualCatalogError(`Sidecar file field does not match lesson art: ${relativeFile}`);
        }

        const bytes = await readFile(file);
        const dimensions = readImageDimensions(bytes, extname(file).toLowerCase());
        assets.push({
            id: requiredString(sidecar.assetId, `Missing assetId in ${relativeFile} sidecar.`),
            file: relativeFile,
            mediaType: mediaTypeFor(file),
            byteLength: bytes.length,
            sha256: sha256(bytes),
            dimensions,
            status: sidecar.status,
            lessonIds: sidecar.lessonIds ?? [],
            jlptLevels: sidecar.jlptLevels ?? [],
            topics: sidecar.topics ?? [],
            modalities: sidecar.modalities ?? [],
            provenance: sidecar.provenance,
            rights: sidecar.rights,
            derivativePolicy: sidecar.derivativePolicy,
            brief: sidecar.brief,
        });
    }

    return assets.sort((left, right) => compareStrings(left.id, right.id));
}

async function auditMoodleRaw(file) {
    const source = await readJsonWithHashIfExists(file);
    if (!source) return missingAudit('moodle-raw');
    const manifest = source.data;
    const courses = Array.isArray(manifest.courses) ? manifest.courses : [];
    const sections = courses.flatMap(course => Array.isArray(course.sections) ? course.sections.map(section => ({ course, section })) : []);
    const modules = sections.flatMap(({ course, section }) =>
        (Array.isArray(section.modules) ? section.modules : []).map(module => ({ course, section, module })),
    );

    const moduleTypeCounts = countBy(modules, item => item.module.type ?? 'unknown');
    const lessonNineSignals = modules
        .filter(({ module }) => /\blesson\s*9\b/i.test(module.title ?? ''))
        .map(({ course, section, module }) => sourceRef({
            source: 'moodle-raw',
            courseId: course.id,
            sectionId: section.id,
            level: section.level,
            moduleId: module.id,
            moduleType: module.type,
            title: module.title,
        }));
    const kanjiSignals = modules
        .filter(({ module }) => /^Kanji\s+(?:4|6|7)\b/i.test(module.title ?? ''))
        .map(({ course, section, module }) => sourceRef({
            source: 'moodle-raw',
            courseId: course.id,
            sectionId: section.id,
            level: section.level,
            moduleId: module.id,
            moduleType: module.type,
            title: module.title,
        }));

    return {
        status: 'ok',
        schema: manifest.schema ?? null,
        sha256: source.sha256,
        generated: manifest.generated ?? null,
        sourceKind: sanitizeText(manifest.source?.site ?? 'Moodle archive manifest'),
        courseCount: courses.length,
        sectionCount: sections.length,
        moduleCount: modules.length,
        moduleTypeCounts,
        lessonNineSignals,
        kanjiSignals,
        reuseGuidance: 'Use module identity and topic titles as lesson provenance. Do not publish downloaded folder bytes or private member names from the raw archive.',
    };
}

async function auditPublishableCatalog(file) {
    const source = await readJsonWithHashIfExists(file);
    if (!source) return missingAudit('moodle-publishable-catalog');
    const catalog = source.data;
    return {
        status: 'ok',
        schema: catalog.schema ?? null,
        sha256: source.sha256,
        provenance: {
            captureId: sanitizeText(catalog.provenance?.captureId ?? ''),
            capturedAt: catalog.provenance?.capturedAt ?? null,
            sourceManifestSha256: catalog.provenance?.sourceManifestSha256 ?? null,
        },
        summary: catalog.summary ?? {},
        manifestSummary: catalog.manifest ?? {},
        fileTypePatterns: catalog.patterns?.byFileType ?? [],
        reuseGuidance: 'This catalog is already metadata-only. It shows many PDFs and MP3s but no publishable extracted images; treat PDFs as private extraction candidates until rights are cleared.',
    };
}

async function auditJapaneseLibrary(root) {
    if (!(await exists(root))) return missingAudit('japanese-library');

    const lessonsRoot = join(root, 'Lessons');
    const genkiRoot = join(root, 'Resource Packs', 'genki-study-resources-master 2');
    const subtitlesRoot = join(root, 'Subtitles');
    const lessonFiles = await listFiles(lessonsRoot, { extensions: LESSON_SOURCE_EXTENSIONS, maxDepth: 5 });
    const genkiFiles = await listFiles(genkiRoot, { extensions: GENKI_EXTENSIONS, maxDepth: 7 });
    const subtitleFiles = await listFiles(subtitlesRoot, { extensions: SUBTITLE_EXTENSIONS, maxDepth: 3 });

    const lessonKindCounts = countBy(lessonFiles, file => classifyLessonFile(file));
    const liveLessonSignals = lessonFiles
        .filter(file => /(?:info gap|picture|listening|kanji|vocabulary|map|chart|speaking)/i.test(file))
        .map(file => sourceRef({
            source: 'japanese-library',
            path: safeRelative(root, file),
            modality: classifyLessonFile(file),
            workflow: workflowForJapaneseFile(file),
        }))
        .sort((left, right) => compareStrings(left.path ?? '', right.path ?? ''))
        .slice(0, 32);

    const genkiLessonIds = new Set();
    for (const file of genkiFiles) {
        const match = safeRelative(genkiRoot, file).match(/lessons\/(lesson-\d+)/);
        if (match) genkiLessonIds.add(match[1]);
    }

    return {
        status: 'ok',
        sourceLabel: 'japanese-library',
        lessonFileCount: lessonFiles.length,
        lessonKindCounts,
        genkiStudyResources: {
            scanned: await exists(genkiRoot),
            lessonCount: genkiLessonIds.size,
            htmlExerciseCount: genkiFiles.filter(file => extname(file).toLowerCase() === '.html').length,
            audioCount: genkiFiles.filter(file => extname(file).toLowerCase() === '.mp3').length,
            guidance: 'Best structured N5 to N4 content signal; generate original visuals from lesson topics rather than copying textbook or exercise art.',
        },
        subtitleCorpus: {
            scanned: await exists(subtitlesRoot),
            subtitleFileCount: subtitleFiles.length,
            guidance: 'Use transcripts as listening-scene brief sources. Do not publish subtitle text or screenshots without source rights review.',
        },
        liveLessonSignals,
        reuseGuidance: 'Use filenames and course alignment for topics, audio-adjacent scene briefs, and private extraction planning. Do not bulk-copy textbook PDFs, workbook art, or audio packs.',
    };
}

async function auditSoyaResearch(root) {
    if (!(await exists(root))) return missingAudit('soya-research');
    const imageReport = await readJsonWithHashIfExists(join(root, 'listening-image-download-report.json'));
    const audioMap = await readJsonWithHashIfExists(join(root, 'listening-question-audio-map.json'));
    const staticManifest = await readJsonWithHashIfExists(join(root, 'bundles', 'asset-manifest.json'));
    const liveManifest = await readJsonWithHashIfExists(join(root, 'bundles', 'asset-manifest-live.json'));

    const imageGroups = {};
    if (imageReport?.data) {
        for (const item of imageReport.data.ok ?? []) {
            const group = soyaImageGroup(item.path);
            imageGroups[group] ??= { count: 0, bytes: 0, samples: [] };
            imageGroups[group].count += 1;
            imageGroups[group].bytes += item.bytes ?? 0;
            if (imageGroups[group].samples.length < 5) {
                imageGroups[group].samples.push(sourceRef({ source: 'soya-research', path: item.path }));
            }
        }
    }

    return {
        status: 'ok',
        imageReport: imageReport
            ? {
                sha256: imageReport.sha256,
                attempted: imageReport.data.attempted?.length ?? 0,
                ok: imageReport.data.ok?.length ?? 0,
                missing: imageReport.data.missing?.length ?? 0,
                error: imageReport.data.error?.length ?? 0,
                groups: sortObject(imageGroups),
            }
            : missingAudit('soya-listening-image-report'),
        listeningAudioMap: audioMap
            ? {
                sha256: audioMap.sha256,
                counts: audioMap.data.counts ?? {},
                questionCount: Array.isArray(audioMap.data.questions) ? audioMap.data.questions.length : 0,
            }
            : missingAudit('soya-listening-audio-map'),
        mediaManifestCounts: {
            static: summarizeSoyaManifest(staticManifest),
            live: summarizeSoyaManifest(liveManifest),
        },
        reuseGuidance: 'Use Soya listening PNGs as reference-only style/task signals unless upstream rights are explicitly cleared. Prefer recreation briefs for N5/N4 point diagrams and listening-question scenes.',
    };
}

async function auditTextSource(file, label) {
    if (!(await exists(file))) return missingAudit(label);
    const bytes = await readFile(file);
    return {
        status: 'ok',
        label,
        sha256: sha256(bytes),
        byteLength: bytes.length,
        reuseGuidance: 'Checksum only; the source document supplies human audit context without copying its prose into the public catalog.',
    };
}

function buildReusableSignals(moodleRawAudit, japaneseLibraryAudit, soyaAudit) {
    return [
        {
            id: 'lesson-09-weekend-plan',
            priority: 'now',
            lessons: ['unit-level-3-plus-lesson-09'],
            jlptLevels: ['N4'],
            topics: ['meeting place', 'weather fallback', 'food options', 'route support', 'polite negative question', 'purpose youni', 'kanji food quantity'],
            modalities: ['lesson thumbnail', 'listening prompt', 'grammar cue', 'writing prompt'],
            sourceSignals: [
                'moodle-raw: Level 3+ Lesson 9 and Kanji 7 modules',
                'japanese-library: Minna II chapter 30 live lessons and audio-adjacent PDFs',
            ],
            assetStrategy: 'Use cleared original scene art already in public/academy/art/lessons, then add cropped lesson cards from those originals.',
        },
        {
            id: 'foundations-n5-visual-core',
            priority: 'next',
            lessons: ['foundation-kana', 'foundation-classroom', 'n5-core-actions'],
            jlptLevels: ['Foundations', 'N5'],
            topics: ['kana forms', 'classroom objects', 'prices', 'locations', 'family', 'food', 'daily actions'],
            modalities: ['vocabulary card', 'minimal pair cue', 'listening point diagram'],
            sourceSignals: [
                `japanese-library: Genki exercise lessons scanned=${japaneseLibraryAudit.genkiStudyResources?.lessonCount ?? 0}`,
                `soya-research: N5 point images=${soyaAudit.imageReport?.groups?.['N5:point']?.count ?? 0}`,
            ],
            assetStrategy: 'Recreate simple original diagrams and object scenes from structured lesson topics; do not copy textbook or mirrored site art.',
        },
        {
            id: 'n4-listening-and-state-scenes',
            priority: 'next',
            lessons: ['minna-ch28-30', 'academy-n4-bridge'],
            jlptLevels: ['N4'],
            topics: ['habitual action', 'state in effect', 'accidental completion', 'preparation', 'left state'],
            modalities: ['listening scene', 'grammar contrast card', 'speaking prompt'],
            sourceSignals: [
                `moodle-publishable-catalog: audio members=${fileTypeCount(moodleRawAudit, 'audio')}`,
                `soya-research: N4 listening PNGs=${soyaAudit.imageReport?.groups?.['N4:listening-question']?.count ?? 0}`,
            ],
            assetStrategy: 'Generate coherent original scene families aligned to Minna chapters 28-30 and Lesson 9 rather than extracting private worksheets.',
        },
    ];
}

function buildDerivativeWorkflows() {
    return [
        {
            id: 'crop',
            allowedFor: ['cleared original raster', 'licensed public-domain raster'],
            steps: [
                'Record parent file sha256 and dimensions before cropping.',
                'Choose a fixed aspect ratio target for the consuming UI.',
                'Export as web JPEG or WebP without adding readable text.',
                'Write a sidecar with crop rectangle, parent hash, and purpose.',
            ],
            forbidden: ['cropping private worksheet scans into public assets without rights review'],
        },
        {
            id: 'extract',
            allowedFor: ['private review', 'explicitly licensed source document'],
            steps: [
                'Render only the required page or frame.',
                'Remove names, emails, phone numbers, and institution-specific marks.',
                'Keep the extracted asset private until license and attribution are recorded.',
                'Prefer recreating a clean original visual when rights are unclear.',
            ],
            forbidden: ['publishing raw Moodle member bytes or textbook art by default'],
        },
        {
            id: 'retouch',
            allowedFor: ['cleared original raster'],
            steps: [
                'Preserve the original file and create a derivative with a new asset id.',
                'Limit edits to cleanup, crop, contrast, and removal of accidental readable artifacts.',
                'Document every transformation in the sidecar.',
            ],
            forbidden: ['retouching uncleared source material to obscure provenance'],
        },
        {
            id: 'recreate',
            allowedFor: ['uncleared reference material', 'audio-adjacent topic signal', 'text-only lesson brief'],
            steps: [
                'Write a text-only brief using topic, modality, and learner action.',
                'Avoid mimicking a source composition when rights are unclear.',
                'Use blank signs, blank papers, and fictional places.',
                'Record generator, prompt, negative prompt, and no-image-input attestation.',
            ],
            forbidden: ['using private images as generation inputs for public assets'],
        },
    ];
}

function buildProductionBriefs() {
    return [
        {
            id: 'brief-foundation-classroom-objects',
            priority: 'next',
            lessonScope: ['Foundations', 'N5'],
            modality: 'vocabulary-card-set',
            prompt: 'Create a cohesive 3:2 raster illustration of a calm adult Japanese class desk with a pencil, book, notebook, clock, bag, and blank page labels. Warm natural light, readable object silhouettes, no text, no logos, no brand marks, no children, no private documents. Leave clear negative space for app overlays.',
            derivativePlan: 'Generate one wide image, then crop six object-detail cards with parent-hash sidecars.',
        },
        {
            id: 'brief-n5-station-location-price',
            priority: 'next',
            lessonScope: ['N5 demonstratives', 'N5 location', 'N5 prices'],
            modality: 'grammar-visual-cue',
            prompt: 'Create an original fictional station kiosk scene in 3:2. Adult learners compare a nearby item, a farther item, a blank price tag, and a simple direction gesture toward a restroom icon-like doorway. No readable text, no real station names, no logos, no currency numerals, clean educational composition.',
            derivativePlan: 'Use as a grammar cue for kore/sore/are, koko/soko/asoko, and price-question practice.',
        },
        {
            id: 'brief-n4-teoku-preparation-desk',
            priority: 'next',
            lessonScope: ['Minna chapter 30', 'N4 preparation grammar'],
            modality: 'listening-and-speaking-prompt',
            prompt: `Create an original 3:2 evening preparation scene: adult learner sets out an umbrella, train card placeholder, lunch container, phone with blank screen, and notebook before tomorrow's outing. The action should clearly imply preparing in advance. No readable writing, no logos, no private room details, no branded transit cards.`,
            derivativePlan: 'Pair with te oku, route-planning, and Lesson 9 fallback practice.',
        },
    ];
}

async function listFiles(root, { extensions, maxDepth }) {
    if (!(await exists(root))) return [];
    const results = [];
    await walk(root, 0);
    return results.sort(compareStrings);

    async function walk(directory, depth) {
        if (depth > maxDepth) return;
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }

        entries.sort((left, right) => compareStrings(left.name, right.name));
        for (const entry of entries) {
            if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__MACOSX') continue;
            const fullPath = join(directory, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath, depth + 1);
            } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
                results.push(fullPath);
            }
        }
    }
}

async function readJsonWithHashIfExists(file) {
    if (!(await exists(file))) return null;
    const bytes = await readFile(file);
    return { data: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')), sha256: sha256(bytes) };
}

async function readJsonIfExists(file) {
    if (!(await exists(file))) return null;
    const bytes = await readFile(file);
    return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
}

async function exists(file) {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

function readImageDimensions(bytes, extension) {
    if (extension === '.png') {
        const signature = '89504e470d0a1a0a';
        if (bytes.subarray(0, 8).toString('hex') !== signature) return null;
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }

    if (extension === '.jpg' || extension === '.jpeg') {
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
        let offset = 2;
        while (offset < bytes.length) {
            while (bytes[offset] === 0xff) offset += 1;
            const marker = bytes[offset];
            offset += 1;
            if (marker === 0xd9 || marker === 0xda) break;
            const segmentLength = bytes.readUInt16BE(offset);
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
                return {
                    width: bytes.readUInt16BE(offset + 5),
                    height: bytes.readUInt16BE(offset + 3),
                };
            }
            offset += segmentLength;
        }
    }

    return null;
}

function classifyLessonFile(file) {
    const extension = extname(file).toLowerCase();
    if (['.mp3', '.m4a', '.wav', '.ogg'].includes(extension)) return 'audio';
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return 'image';
    if (/listening/i.test(file)) return 'audio-adjacent-document';
    if (/(?:info gap|picture|map|chart)/i.test(file)) return 'visual-extraction-candidate';
    if (/kanji/i.test(file)) return 'kanji-visual-document';
    return 'document';
}

function workflowForJapaneseFile(file) {
    if (classifyLessonFile(file) === 'audio') return 'audio-adjacent-brief';
    if (/(?:info gap|picture|map|chart)/i.test(file)) return 'extract-or-recreate-after-rights-review';
    if (/listening/i.test(file)) return 'recreate-listening-scene';
    return 'topic-reference-only';
}

function soyaImageGroup(path) {
    const level = (path.match(/n(\d)/i)?.[0] ?? 'other').toUpperCase();
    let group = 'other';
    if (/point/i.test(path)) group = 'point';
    else if (/listen/i.test(path)) group = 'listening-question';
    else if (/mock/i.test(path)) group = 'mock-task';
    return `${level}:${group}`;
}

function summarizeSoyaManifest(source) {
    if (!source) return missingAudit('soya-media-manifest');
    const files = Object.values(source.data.files ?? {});
    const images = files.filter(path => /\.(?:png|jpe?g|webp|gif|svg)$/i.test(path));
    return {
        sha256: source.sha256,
        fileCount: files.length,
        imageCount: images.length,
        imageSamples: images.slice(0, 8).map(path => sourceRef({ source: 'soya-research', path })),
    };
}

function fileTypeCount(audit, kind) {
    const patterns = audit?.fileTypePatterns ?? [];
    return patterns
        .filter(pattern => pattern.kind === kind)
        .reduce((sum, pattern) => sum + (pattern.occurrenceCount ?? 0), 0);
}

function countBy(items, selectKey) {
    const counts = {};
    for (const item of items) {
        const key = selectKey(item);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return sortObject(counts);
}

function sortObject(object) {
    return Object.fromEntries(Object.entries(object).sort(([left], [right]) => compareStrings(left, right)));
}

function sourceRef(input) {
    const ref = {};
    for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null || value === '') continue;
        ref[key] = typeof value === 'string' ? sanitizeText(value) : value;
    }
    return ref;
}

function safeRelative(root, file) {
    return sanitizeText(toPosix(relative(root, file)));
}

function sanitizeText(value) {
    return String(value)
        .replace(CONTACT_EMAIL, '[redacted-email]')
        .replace(URL_PATTERN, '[redacted-url]')
        .replaceAll('\\', '/');
}

function assertNoPrivateLeak(value) {
    const text = JSON.stringify(value);
    if (text.includes('/Users/')) {
        throw new VisualCatalogError('Catalog contains an absolute private filesystem path.');
    }
    if (CONTACT_EMAIL.test(text)) {
        throw new VisualCatalogError('Catalog contains an email address.');
    }
}

function requiredString(value, message) {
    if (typeof value !== 'string' || value.length === 0) throw new VisualCatalogError(message);
    return value;
}

function mediaTypeFor(file) {
    const extension = extname(file).toLowerCase();
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.png') return 'image/png';
    if (extension === '.webp') return 'image/webp';
    return 'application/octet-stream';
}

function missingAudit(label) {
    return { status: 'missing', label };
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function toPosix(path) {
    return path.split(sep).join('/');
}

function compareStrings(left, right) {
    return left.localeCompare(right, 'en');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await runCli();
}
