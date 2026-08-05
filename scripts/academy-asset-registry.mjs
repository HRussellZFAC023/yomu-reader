#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// public/academy is the single source. docs/public/academy is generated:
// scripts/sync-academy.cjs rm -rf's it and rewrites it from public/academy on
// every build:academy, so writing (or hash-checking) a second copy here is work
// the next sync discards.
const REGISTRY_OUTPUT = path.join(REPO_ROOT, 'public/academy/art/ACADEMY-ASSET-REGISTRY.json');
const RUNTIME_LEDGER_PATH = path.join(REPO_ROOT, 'public/academy/art/ASSET-USAGE.json');
const RECOVERY_LEDGER_PATH = path.join(REPO_ROOT, 'docs/academy/recovery/ASSET-CARRYOVER.json');
const LISTENING_BINDINGS_PATH = path.join(REPO_ROOT, 'public/academy/content/listening/listening-task-bindings.v1.json');
const SNAPSHOT_DATE = '2026-07-15';

const LESSON_SCOPE = [
    { ordinal: 27, packageId: 'l2-l02', plateAssetId: 'location.station' },
    { ordinal: 28, packageId: 'l2-l03', plateAssetId: 'location.home' },
    { ordinal: 29, packageId: 'l2-l04', plateAssetId: 'location.classroom' },
    { ordinal: 30, packageId: 'l2-l05', plateAssetId: 'location.station' },
    { ordinal: 31, packageId: 'l2-l06', plateAssetId: 'location.library' },
    { ordinal: 32, packageId: 'l2-l07', plateAssetId: 'location.ramen' },
    { ordinal: 33, packageId: 'l2-l08', plateAssetId: 'location.park' },
    { ordinal: 34, packageId: 'l2-l09', plateAssetId: 'location.language-lab' },
    { ordinal: 35, packageId: 'l2-l10', plateAssetId: 'location.station' },
    { ordinal: 36, packageId: 'l2-l11', plateAssetId: 'location.station' },
    { ordinal: 37, packageId: 'l2-l12', plateAssetId: 'location.writing-studio' },
    { ordinal: 38, packageId: 'l2-l13', plateAssetId: 'location.cafe' },
    { ordinal: 39, packageId: 'l2-l14', plateAssetId: 'location.language-lab' },
    { ordinal: 40, packageId: 'l2-l15', plateAssetId: 'location.classroom' },
    { ordinal: 41, packageId: 'l2-l16', plateAssetId: 'location.classroom' },
];

const WORLD_SCOPE = [
    { id: 'station', plateAssetIds: ['location.station', 'location.station-platform'], itemAssetIds: ['item.station-ticket'] },
    { id: 'cafe', plateAssetIds: ['location.cafe'], itemAssetIds: ['item.cafe-order-scene'] },
    { id: 'konbini', plateAssetIds: ['location.konbini'], itemAssetIds: ['item.konbini-shopping-list'] },
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .flatMap(entry => {
            const target = path.join(directory, entry.name);
            return entry.isDirectory() ? walk(target) : [target];
        });
}

function publicPath(file) {
    return `/${path.relative(path.join(REPO_ROOT, 'public'), file).split(path.sep).join('/')}`;
}

async function loadRuntimeRegistry() {
    const { build } = await import('esbuild');
    const result = await build({
        entryPoints: [path.join(REPO_ROOT, 'src/academy/assets.ts')],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        write: false,
    });
    const source = result.outputFiles[0].text;
    const compiled = { exports: {} };
    Function('module', 'exports', source)(compiled, compiled.exports);
    return compiled.exports.ACADEMY_RUNTIME_ASSET_REGISTRY;
}

function runtimeLedgerAssetsByPath(ledger) {
    const byPath = new Map();
    for (const asset of ledger.assets) {
        for (const delivery of asset.deliveries ?? []) byPath.set(delivery.path, { asset, delivery });
    }
    return byPath;
}

function runtimeAssetRecord(id, runtimeRegistry, ledgerByPath) {
    const runtime = runtimeRegistry[id];
    if (!runtime) throw new TypeError(`Missing runtime asset ${id}.`);
    const deliveries = Object.entries(runtime.files).map(([variant, deliveryPath]) => {
        const ledger = ledgerByPath.get(deliveryPath);
        if (!ledger) throw new TypeError(`${id} is not authorized in ASSET-USAGE.json: ${deliveryPath}`);
        return { variant, path: deliveryPath, sha256: ledger.delivery.sha256 };
    });
    const ledgerAssets = [...new Set(deliveries.map(delivery => ledgerByPath.get(delivery.path).asset))];
    if (ledgerAssets.length !== 1) throw new TypeError(`${id} spans multiple runtime-ledger records.`);
    const ledger = ledgerAssets[0];
    if (JSON.stringify(ledger.runtimeHome) !== JSON.stringify(runtime.runtimeHomes)) {
        throw new TypeError(`${id} runtime homes drifted between assets.ts and ASSET-USAGE.json.`);
    }
    return {
        id,
        kind: runtime.kind,
        approval: runtime.status,
        provenance: {
            registry: runtime.provenance,
            ledger: ledger.provenance,
            source: ledger.source,
            ...(ledger.sourceSha256 ? { sourceSha256: ledger.sourceSha256 } : {}),
        },
        runtimeUses: [...runtime.runtimeHomes],
        orphanStatus: 'active-runtime',
        deliveries,
        ...(runtime.responsivePresentation ? { responsivePresentation: runtime.responsivePresentation } : {}),
    };
}

function responsiveVariants(asset) {
    const wide = asset.deliveries.find(delivery => delivery.variant === 'wide') ?? null;
    const mobile = asset.deliveries.find(delivery => delivery.variant === 'mobile') ?? null;
    if (!wide || !mobile) return { status: 'not-applicable', wide, mobile };
    const artDirection = asset.responsivePresentation?.mobile;
    return {
        status: wide.path === mobile.path
            ? artDirection ? 'complete-art-directed-single-source' : 'shared-wide-fallback'
            : 'complete-distinct-pair',
        wide,
        mobile,
        ...(artDirection ? { artDirection } : {}),
    };
}

function loadRuntimeSource() {
    return walk(path.join(REPO_ROOT, 'src/academy'))
        .filter(file => file.endsWith('.ts'))
        .map(file => fs.readFileSync(file, 'utf8'))
        .join('\n');
}

function listeningDeliveriesByPackage(bindings) {
    const byPackage = new Map();
    for (const entry of bindings.entries ?? []) {
        if (entry.delivery?.status !== 'packaged-static' || !entry.delivery.url) continue;
        const rows = byPackage.get(entry.packageId) ?? new Map();
        rows.set(entry.delivery.url, {
            path: entry.delivery.url,
            sha256: entry.source.audioSha256,
            provenance: {
                family: entry.source.corpus,
                locator: entry.locator,
                evidence: entry.source.questionMapRef,
            },
            runtimeUse: `listening-task:${entry.packageId}`,
            orphanStatus: 'active-runtime',
        });
        byPackage.set(entry.packageId, rows);
    }
    return new Map([...byPackage].map(([packageId, rows]) => [packageId, [...rows.values()].sort(comparePath)]));
}

function lessonSourceMedia(packageId, runtimeSource, listeningByPackage) {
    const directory = path.join(REPO_ROOT, 'public/academy/content/lessons', packageId);
    const packagedListening = listeningByPackage.get(packageId) ?? [];
    const packagedHashes = new Set(packagedListening.map(asset => asset.sha256));
    const media = walk(directory).map(file => {
        const deliveryPath = publicPath(file);
        const digest = sha256(file);
        const directlyReferenced = runtimeSource.includes(deliveryPath);
        const hashAddressed = packagedHashes.has(digest);
        return {
            path: deliveryPath,
            sha256: digest,
            type: path.extname(file).toLowerCase() === '.mp3' ? 'source-audio' : 'source-visual',
            provenance: {
                family: 'moodle-source-package',
                record: `public/academy/content/lessons/${String(Number(packageId.slice(4)) + 27).padStart(3, '0')}-${packageId}.json`,
            },
            runtimeUse: directlyReferenced
                ? `lesson-activity:${packageId}`
                : hashAddressed ? `superseded-by-hash-addressed-listening:${packageId}` : null,
            orphanStatus: directlyReferenced
                ? 'active-runtime'
                : hashAddressed ? 'superseded-duplicate-delivery' : 'unreferenced-delivery',
        };
    });
    return {
        lessonPackage: `public/academy/content/lessons/${String(Number(packageId.slice(4)) + 27).padStart(3, '0')}-${packageId}.json`,
        media: media.sort(comparePath),
        packagedListening,
    };
}

function comparePath(a, b) {
    return a.path.localeCompare(b.path, 'en');
}

function gap(id, need, supportedBy = []) {
    return { id, status: 'missing-purposeful-asset', need, supportedBy };
}

function recoveryCandidatesFor(worldId, recoveryLedger) {
    return recoveryLedger.assets
        .filter(asset => asset.qualityVerdict === 'verified-manifest-reviewed')
        .filter(asset => asset.orphanState === 'recovered-archive-only')
        .filter(asset => asset.destination?.status === 'recovered-non-runtime')
        .filter(asset => (asset.places ?? []).some(place => place.includes(worldId)))
        .map(asset => ({
            sha256: asset.sha256,
            type: asset.assetType,
            path: asset.destination.path,
            provenance: asset.provenance,
            runtimeUses: [],
            orphanStatus: 'recovered-archive-only',
            approval: 'manifest-reviewed-recovery-candidate-not-runtime-authorized',
        }))
        .sort(comparePath);
}

export async function buildRegistry({ runtimeRegistry: providedRuntimeRegistry } = {}) {
    const [runtimeRegistry, runtimeLedger, recoveryLedger, listeningBindings] = await Promise.all([
        providedRuntimeRegistry ?? loadRuntimeRegistry(),
        Promise.resolve(readJson(RUNTIME_LEDGER_PATH)),
        Promise.resolve(readJson(RECOVERY_LEDGER_PATH)),
        Promise.resolve(readJson(LISTENING_BINDINGS_PATH)),
    ]);
    const ledgerByPath = runtimeLedgerAssetsByPath(runtimeLedger);
    const runtimeSource = loadRuntimeSource();
    const listeningByPackage = listeningDeliveriesByPackage(listeningBindings);

    const lessons = LESSON_SCOPE.map(scope => {
        const source = lessonSourceMedia(scope.packageId, runtimeSource, listeningByPackage);
        if (!scope.plateAssetId) {
            return {
                ...scope,
                provenance: source,
                runtimeUse: { status: 'source-activity-only', plateAsset: null },
                orphanStatus: 'missing-presentation-owner',
                responsiveVariants: { status: 'missing', wide: null, mobile: null },
                intentionalOmissions: ['name-only-cast-does-not-authorize-likeness-art'],
                missingPurposefulAssets: [gap(
                    'lesson-36-responsive-presentation',
                    'An approved world/presentation owner and responsive plate are required before Lesson 36 receives scene art.',
                )],
            };
        }
        const plateAsset = runtimeAssetRecord(scope.plateAssetId, runtimeRegistry, ledgerByPath);
        const variants = responsiveVariants(plateAsset);
        const missingPurposefulAssets = variants.status === 'shared-wide-fallback'
            ? [gap(
                `lesson-${scope.ordinal}-mobile-plate`,
                'A distinct reviewed mobile composition is missing; runtime currently uses the approved wide delivery as its explicit fallback.',
            )]
            : [];
        return {
            ...scope,
            provenance: source,
            runtimeUse: { status: 'active-runtime', plateAsset },
            orphanStatus: 'active-runtime',
            responsiveVariants: variants,
            intentionalOmissions: ['name-only-cast-does-not-authorize-likeness-art'],
            missingPurposefulAssets,
        };
    });

    const worlds = WORLD_SCOPE.map(scope => {
        const plates = scope.plateAssetIds.map(id => runtimeAssetRecord(id, runtimeRegistry, ledgerByPath));
        const items = scope.itemAssetIds.map(id => runtimeAssetRecord(id, runtimeRegistry, ledgerByPath));
        const activeHashes = new Set(items.flatMap(item => item.deliveries.map(delivery => delivery.sha256)));
        const recoveredCandidates = recoveryCandidatesFor(scope.id, recoveryLedger)
            .filter(candidate => !activeHashes.has(candidate.sha256));
        const missingPurposefulAssets = scope.id === 'cafe' && items.length === 0
            ? [gap(
                'cafe-inspectable-order-prop',
                'Cafe has no authorized inspectable reward prop; reviewed recovery art remains archive-only until a runtime owner approves an exact use.',
                recoveredCandidates
                    .filter(candidate => candidate.path.endsWith('/food-cafe-order.jpg'))
                    .map(candidate => candidate.sha256),
            )]
            : [];
        return {
            id: scope.id,
            provenance: { runtimeLedger: 'public/academy/art/ASSET-USAGE.json', recoveryLedger: 'docs/academy/recovery/ASSET-CARRYOVER.json' },
            runtimeUse: { status: 'active-runtime', plates, items },
            orphanStatus: 'active-runtime-with-explicit-recovery-candidates',
            responsiveVariants: plates.map(plate => ({ assetId: plate.id, ...responsiveVariants(plate) })),
            recoveredCandidates,
            missingPurposefulAssets,
        };
    });

    const missingPurposefulAssets = [
        ...lessons.flatMap(lesson => lesson.missingPurposefulAssets.map(item => ({ scope: `lesson:${lesson.ordinal}`, ...item }))),
        ...worlds.flatMap(world => world.missingPurposefulAssets.map(item => ({ scope: `world:${world.id}`, ...item }))),
    ].sort((a, b) => a.id.localeCompare(b.id, 'en'));

    return {
        schemaVersion: 1,
        snapshotDate: SNAPSHOT_DATE,
        purpose: 'Generated conformance registry for Academy Lessons 27-41 and the station, cafe, and konbini asset stream.',
        authority: {
            runtimeAuthorization: 'public/academy/art/ASSET-USAGE.json',
            typedRuntimeUse: 'src/academy/assets.ts',
            recoveryOnly: 'docs/academy/recovery/ASSET-CARRYOVER.json',
            recoveryDoesNotAuthorizeRuntime: true,
        },
        scope: {
            lessons: { first: 27, last: 41, packageIds: LESSON_SCOPE.map(item => item.packageId) },
            worlds: WORLD_SCOPE.map(item => item.id),
        },
        counts: {
            lessons: lessons.length,
            worlds: worlds.length,
            sourceMedia: lessons.reduce((sum, lesson) => sum + lesson.provenance.media.length + lesson.provenance.packagedListening.length, 0),
            activeRuntimeAssets: new Set([
                ...lessons.flatMap(lesson => lesson.runtimeUse.plateAsset ? [lesson.runtimeUse.plateAsset.id] : []),
                ...worlds.flatMap(world => [...world.runtimeUse.plates, ...world.runtimeUse.items].map(asset => asset.id)),
            ]).size,
            recoveredCandidates: worlds.reduce((sum, world) => sum + world.recoveredCandidates.length, 0),
            missingPurposefulAssets: missingPurposefulAssets.length,
        },
        lessons,
        worlds,
        missingPurposefulAssets,
    };
}

export function serializeRegistry(registry) {
    return `${JSON.stringify(registry, null, 2)}\n`;
}

export function validateRegistry(registry) {
    const errors = [];
    if (registry.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (registry.snapshotDate !== SNAPSHOT_DATE) errors.push(`snapshotDate must be ${SNAPSHOT_DATE}`);
    if (registry.lessons.length !== 15) errors.push('lesson scope must contain Lessons 27-41');
    if (registry.worlds.map(world => world.id).join(',') !== 'station,cafe,konbini') errors.push('world scope must be station,cafe,konbini');
    for (const lesson of registry.lessons) {
        if (!lesson.provenance || !lesson.runtimeUse || !lesson.orphanStatus || !lesson.responsiveVariants || !lesson.missingPurposefulAssets) {
            errors.push(`Lesson ${lesson.ordinal} is missing a required reconciliation field.`);
        }
        for (const media of [...lesson.provenance.media, ...lesson.provenance.packagedListening]) {
            const file = path.join(REPO_ROOT, 'public', media.path.slice(1));
            if (!fs.existsSync(file)) errors.push(`${media.path} is missing`);
            else if (sha256(file) !== media.sha256) errors.push(`${media.path} hash drifted`);
        }
    }
    for (const world of registry.worlds) {
        if (!world.provenance || !world.runtimeUse || !world.orphanStatus || !world.responsiveVariants || !world.missingPurposefulAssets) {
            errors.push(`${world.id} is missing a required reconciliation field.`);
        }
        for (const candidate of world.recoveredCandidates) {
            const file = path.join(REPO_ROOT, candidate.path);
            if (!fs.existsSync(file)) errors.push(`${candidate.path} is missing`);
            else if (sha256(file) !== candidate.sha256) errors.push(`${candidate.path} hash drifted`);
        }
    }
    return errors;
}

function validateRegistryLedgerRecord() {
    const ledger = readJson(RUNTIME_LEDGER_PATH);
    const entry = ledger.assets.find(asset => asset.id === 'academy-asset-registry-v1');
    const delivery = entry?.deliveries?.find(candidate => candidate.path === '/academy/art/ACADEMY-ASSET-REGISTRY.json');
    const errors = [];
    if (!entry || !delivery) errors.push('ASSET-USAGE.json is missing the Academy asset registry record');
    else {
        if (entry.verdict !== 'generated-conformance-data/non-runtime' || entry.runtimeHome?.length !== 0) {
            errors.push('Academy asset registry metadata must remain explicitly non-runtime');
        }
        if (fs.existsSync(REGISTRY_OUTPUT) && sha256(REGISTRY_OUTPUT) !== delivery.sha256) {
            errors.push('ASSET-USAGE.json has a stale Academy asset registry hash');
        }
    }
    return errors;
}

async function buildFiles() {
    const registry = await buildRegistry();
    const errors = validateRegistry(registry);
    if (errors.length) throw new Error(errors.join('\n'));
    const serialized = serializeRegistry(registry);
    fs.writeFileSync(REGISTRY_OUTPUT, serialized);
    updateRegistryLedgerHash(crypto.createHash('sha256').update(serialized).digest('hex'));
    console.log(`Built Academy asset registry: ${registry.counts.sourceMedia} source media, ${registry.counts.missingPurposefulAssets} explicit gaps.`);
}

function updateRegistryLedgerHash(registrySha256) {
    const output = RUNTIME_LEDGER_PATH;
    const source = fs.readFileSync(output, 'utf8');
    const entryStart = source.indexOf('"id": "academy-asset-registry-v1"');
    const entryEnd = source.indexOf('\n    {', entryStart + 1);
    if (entryStart < 0) throw new TypeError(`${path.relative(REPO_ROOT, output)} is missing the Academy asset registry record.`);
    const before = source.slice(0, entryStart);
    const entry = source.slice(entryStart, entryEnd < 0 ? source.length : entryEnd);
    const after = entryEnd < 0 ? '' : source.slice(entryEnd);
    const deliveryPattern = /("path": "\/academy\/art\/ACADEMY-ASSET-REGISTRY\.json",\s*"sha256": ")[0-9a-f]{64}("\s*)/u;
    if (!deliveryPattern.test(entry)) {
        throw new TypeError(`${path.relative(REPO_ROOT, output)} is missing the Academy asset registry delivery.`);
    }
    fs.writeFileSync(output, `${before}${entry.replace(deliveryPattern, `$1${registrySha256}$2`)}${after}`);
}

async function validateFiles() {
    const expected = serializeRegistry(await buildRegistry());
    const errors = [];
    if (!fs.existsSync(REGISTRY_OUTPUT)) errors.push(`${path.relative(REPO_ROOT, REGISTRY_OUTPUT)} is missing`);
    else if (fs.readFileSync(REGISTRY_OUTPUT, 'utf8') !== expected) errors.push(`${path.relative(REPO_ROOT, REGISTRY_OUTPUT)} is stale`);
    if (!errors.length) errors.push(...validateRegistry(JSON.parse(expected)), ...validateRegistryLedgerRecord());
    if (errors.length) {
        console.error(errors.join('\n'));
        process.exitCode = 1;
        return;
    }
    console.log('Academy asset registry is current and conformant.');
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
    const command = process.argv[2] ?? 'validate';
    if (command === 'build') await buildFiles();
    else if (command === 'validate') await validateFiles();
    else throw new Error(`Unknown command: ${command}. Use build or validate.`);
}
