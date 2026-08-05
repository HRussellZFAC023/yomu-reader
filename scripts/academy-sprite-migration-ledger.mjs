import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const PUBLIC_ART = path.resolve(ROOT, 'public/academy/art');
// public/academy only: scripts/sync-academy.cjs regenerates
// docs/public/academy from it on every build:academy.
const OUTPUT = path.join(PUBLIC_ART, 'CLASSMATE-SPRITE-INVENTORY.json');
const BATCH_MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ART, 'SPRITE-BATCH-MANIFEST.json'), 'utf8'));
const ASSET_USAGE = JSON.parse(fs.readFileSync(path.join(PUBLIC_ART, 'ASSET-USAGE.json'), 'utf8'));
const RECOVERY = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'docs/academy/recovery/ASSET-CARRYOVER.json'), 'utf8'));

const ANGLES = ['left-three-quarter', 'front-near-front', 'right-three-quarter'];
const EXPRESSIONS = [
    'neutral',
    'encouraging-listening',
    'happy',
    'thoughtful',
    'determined',
    'surprised-shocked',
    'sad-vulnerable',
];

const APPROVED_PATHS = new Set(ASSET_USAGE.assets
    .filter(asset => asset.verdict === 'approved-runtime')
    .flatMap(asset => asset.deliveries ?? [])
    .map(delivery => delivery.path)
    .filter(deliveryPath => deliveryPath.startsWith('/academy/art/characters/')));

const CURRENT_SLOT_OVERRIDES = new Map([
    ['/academy/art/characters/peter/peter__thoughtful__left-three-quarter__halfbody__v001.png', ['left-three-quarter', 'thoughtful']],
    ['/academy/art/characters/sophie/sophie__bookshop-neutral__halfbody__v003.png', ['right-three-quarter', 'neutral']],
    ['/academy/art/characters/rie/rie__thinking__halfbody__v001.png', ['front-near-front', 'thoughtful']],
    ['/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.webp', ['front-near-front', 'neutral']],
    ['/academy/art/characters/rie/rie__determined-glasses__left-three-quarter__halfbody__v001.webp', ['left-three-quarter', 'determined']],
    ['/academy/art/characters/rie/rie__encouraging-glasses__right-three-quarter__halfbody__v001.webp', ['right-three-quarter', 'encouraging-listening']],
]);

const SUPERSEDED_PATHS = new Set([
    '/academy/art/characters/rie/rie__neutral__halfbody__v001.png',
    '/academy/art/characters/rie/rie__determined__left-three-quarter__halfbody__v001.png',
]);

const ledgerByDelivery = new Map();
for (const asset of ASSET_USAGE.assets) {
    for (const delivery of asset.deliveries ?? []) ledgerByDelivery.set(delivery.path, asset);
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function readRasterMetadata(file) {
    const metadata = await sharp(file).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) {
        throw new TypeError(`${file} has no readable raster metadata.`);
    }
    return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        transparency: metadata.hasAlpha ? 'alpha-channel' : 'no-alpha-channel',
    };
}

function normalizeCurrentSlot(publicPath) {
    const override = CURRENT_SLOT_OVERRIDES.get(publicPath);
    if (override) return { angle: override[0], expression: override[1] };
    const name = path.parse(publicPath).name;
    const angle = ANGLES.find(value => name.includes(`__${value}__`)) ?? 'front-near-front';
    const segments = name.split('__');
    let expression = segments[1] === 'sprite' ? segments[2] ?? '' : segments[1] ?? '';
    expression = EXPRESSIONS.find(value =>
        expression === value || expression.startsWith(`${value}-`),
    ) ?? expression;
    if (expression === 'concerned') expression = 'sad-vulnerable';
    if (expression === 'listening' || expression === 'encouraging') expression = 'encouraging-listening';
    if (expression === 'surprised') expression = 'surprised-shocked';
    return EXPRESSIONS.includes(expression) ? { angle, expression } : null;
}

function versionFor(publicPath) {
    return path.basename(publicPath).match(/__(v\d+)\.(?:png|webp)$/)?.[1] ?? 'unversioned';
}

async function currentAssetsFor(character) {
    const directory = path.join(PUBLIC_ART, 'characters', character.id);
    if (!fs.existsSync(directory)) return [];
    return await Promise.all(fs.readdirSync(directory)
        .filter(file => file.endsWith('.webp'))
        .sort()
        .map(async file => {
            const absolute = path.join(directory, file);
            const publicPath = `/academy/art/characters/${character.id}/${file}`;
            const ledger = ledgerByDelivery.get(publicPath);
            const slot = normalizeCurrentSlot(publicPath);
            const status = APPROVED_PATHS.has(publicPath) ? 'approved' : 'review-candidate';
            return {
                path: publicPath,
                sha256: sha256(absolute),
                source: ledger?.source ?? 'unregistered-current-delivery',
                privacy: ledger?.privacy ?? 'no-private-source-recorded',
                status,
                usage: {
                    runtime: ledger?.runtimeHome ?? [],
                    review: ledger?.reviewHome ?? [],
                },
                orphan: (ledger?.runtimeHome?.length ?? 0) > 0
                    ? status === 'approved' ? 'active-runtime' : 'review-bound'
                    : (ledger?.reviewHome?.length ?? 0) > 0 ? 'review-bound' : 'unbound-review-candidate',
                styleVersion: character.id === 'sophie'
                    ? 'current-hand-painted-standard'
                    : character.id === 'rie' ? 'hand-painted-production-family' : 'current-review-family',
                fileVersion: versionFor(publicPath),
                pose: slot ? `${character.basePose}; ${slot.angle}` : `off-contract ${path.parse(file).name.split('__')[1] ?? 'unknown'} pose`,
                angle: slot?.angle ?? null,
                expression: slot?.expression ?? null,
                dimensions: await readRasterMetadata(absolute),
                runtimeUses: ledger?.runtimeHome ?? [],
                reviewUses: ledger?.reviewHome ?? [],
                decision: SUPERSEDED_PATHS.has(publicPath) ? 'replace' : 'keep',
                migrationStatus: status === 'approved'
                    ? SUPERSEDED_PATHS.has(publicPath)
                        ? 'superseded-by-glasses-primary-retained-for-runtime-compatibility'
                        : 'approved-and-registered'
                    : slot ? 'retained-review-candidate-not-approved' : 'retained-off-matrix-review-evidence',
                coverageStatus: slot ? status : 'off-matrix',
            };
        }));
}

function historicalDecision(asset) {
    if (asset.bindingVerdict === 'must-not-bind' || asset.qualityVerdict?.startsWith('rejected-')) return 'delete';
    if (asset.destination?.status === 'current-runtime' || asset.destination?.status === 'current-review') return 'keep';
    return 'replace';
}

const castIds = new Set(BATCH_MANIFEST.characters.map(character => character.id));
const historicalAssets = RECOVERY.assets
    .filter(asset => asset.assetType === 'character-sprite' && asset.characters.some(character => castIds.has(character)))
    .map(asset => ({
        id: asset.id,
        sha256: asset.sha256,
        characters: asset.characters.filter(character => castIds.has(character)),
        dimensions: asset.dimensions,
        transparency: {
            status: asset.extension === '.png' ? 'unknown-not-retained' : 'not-applicable',
            evidence: 'Recovery ledger preserves dimensions and hashes but not decoded alpha samples.',
        },
        styleVersion: {
            generationFamily: asset.provenance?.generationFamily ?? 'unknown',
            provenanceStatus: asset.provenance?.status ?? 'unknown',
            variants: asset.variants ?? [],
        },
        poses: asset.poses ?? [],
        angles: ANGLES.filter(angle => [...(asset.poses ?? []), ...(asset.variants ?? [])].some(value => String(value).includes(angle))),
        expressions: asset.expressions ?? [],
        runtimeUses: asset.runtimeUses ?? [],
        qualityVerdict: asset.qualityVerdict,
        bindingVerdict: asset.bindingVerdict,
        decision: historicalDecision(asset),
        migrationStatus: asset.orphanState,
        occurrenceCount: asset.occurrenceCount,
        occurrences: asset.occurrences,
    }))
    .sort((a, b) => a.sha256.localeCompare(b.sha256));

const historicalIdsByCharacter = new Map(BATCH_MANIFEST.characters.map(character => [character.id, []]));
for (const asset of historicalAssets) {
    for (const character of asset.characters) historicalIdsByCharacter.get(character)?.push(asset.id);
}

const characters = await Promise.all(BATCH_MANIFEST.characters.map(async character => {
    const currentAssets = await currentAssetsFor(character);
    const currentBySlot = new Map();
    for (const asset of currentAssets.filter(asset => asset.angle && asset.expression)) {
        const key = `${asset.angle}:${asset.expression}`;
        const current = currentBySlot.get(key);
        const assetIsPreferred = asset.path.includes('-glasses__') || (!current?.path.includes('-glasses__') && asset.fileVersion > current?.fileVersion);
        if (!current || assetIsPreferred) currentBySlot.set(key, asset);
    }
    const requiredVariants = ANGLES.flatMap(angle => EXPRESSIONS.map(expression => {
        const current = currentBySlot.get(`${angle}:${expression}`);
        return current ? {
            angle,
            expression,
            status: current.coverageStatus,
            path: current.path,
        } : {
            angle,
            expression,
            status: 'missing',
            path: null,
            plannedPath: `/academy/art/characters/${character.id}/${character.id}__${expression}__${angle}__halfbody__v001.png`,
        };
    }));
    const missingVariants = requiredVariants.filter(variant => variant.status === 'missing');
    const approved = requiredVariants.filter(variant => variant.status === 'approved').length;
    const reviewCandidates = requiredVariants.filter(variant => variant.status === 'review-candidate').length;
    return {
        id: character.id,
        firstName: character.firstName,
        category: character.category,
        basePose: character.basePose,
        targetMatrix: { angles: ANGLES, expressions: EXPRESSIONS, slots: ANGLES.length * EXPRESSIONS.length },
        progress: {
            approved,
            reviewCandidates,
            missing: missingVariants.length,
            deliveredPercent: Number((((approved + reviewCandidates) / requiredVariants.length) * 100).toFixed(2)),
            approvedPercent: Number(((approved / requiredVariants.length) * 100).toFixed(2)),
        },
        currentAssets,
        requiredVariants,
        missingVariants,
        historicalAssetIds: historicalIdsByCharacter.get(character.id),
    };
}));

const coverage = characters.reduce((total, character) => ({
    approved: total.approved + character.progress.approved,
    reviewCandidates: total.reviewCandidates + character.progress.reviewCandidates,
    missing: total.missing + character.progress.missing,
}), { approved: 0, reviewCandidates: 0, missing: 0 });

const output = {
    schemaVersion: 2,
    snapshotDate: '2026-07-17',
    purpose: 'Single machine-readable migration ledger for every canonical Academy cast sprite across current delivery and audited older worktrees.',
    truthPolicy: {
        matrixTarget: 'Every character requires three angles by seven expressions. A file is never inferred from a brief.',
        missingArt: 'Undelivered cells remain explicitly missing.',
        approval: 'Generation and physical presence do not imply runtime approval.',
        variedPoses: 'Each character keeps the unique base pose from SPRITE-BATCH-MANIFEST.json; pose cloning is forbidden.',
        deprecatedArt: 'Flat, wrong-style, and rejected-likeness assets are reference-only audit evidence and must not be learner-facing.',
    },
    sources: {
        canonicalCast: 'public/academy/art/SPRITE-BATCH-MANIFEST.json',
        currentAuthorization: 'public/academy/art/ASSET-USAGE.json',
        olderWorktrees: 'docs/academy/recovery/ASSET-CARRYOVER.json',
    },
    target: {
        characters: characters.length,
        angles: ANGLES,
        expressions: EXPRESSIONS,
        slotsPerCharacter: ANGLES.length * EXPRESSIONS.length,
        totalSlots: characters.length * ANGLES.length * EXPRESSIONS.length,
    },
    summary: {
        ...coverage,
        currentPhysicalRasters: characters.reduce((total, character) => total + character.currentAssets.length, 0),
        currentOffMatrixRasters: characters.reduce((total, character) => total + character.currentAssets.filter(asset => asset.coverageStatus === 'off-matrix').length, 0),
        historicalUniqueRasters: historicalAssets.length,
        historicalOccurrences: historicalAssets.reduce((total, asset) => total + asset.occurrenceCount, 0),
        charactersWithApprovedCoverage: characters.filter(character => character.progress.approved > 0).length,
        charactersWithAnyCurrentCoverage: characters.filter(character => character.progress.approved + character.progress.reviewCandidates > 0).length,
    },
    migrations: [{
        id: 'sophie-flat-v002-to-painted-v003',
        character: 'sophie',
        from: '/academy/art/characters/sophie/sophie__neutral__halfbody__v002.png',
        to: '/academy/art/characters/sophie/sophie__bookshop-neutral__halfbody__v003.png',
        decision: 'delete',
        status: 'deprecated-file-removed-after-zero-runtime-reference-scan',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'aakash-neutral-v009-to-illustrated-v010-family',
        character: 'aakash',
        from: '/academy/art/characters/aakash/aakash__sprite__neutral__front-near-front__v009.png',
        to: '/academy/art/characters/aakash/aakash__neutral-route-map-burgundy-hoodie__front-near-front__fullbody__v010.webp',
        decision: 'delete',
        status: 'Illustrated v010 family bound to runtime; superseded realistic and off-contract variants archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'onke-generic-v001-to-illustrated-v002-family',
        character: 'angel',
        from: '/academy/art/characters/angel/angel__standardized-neutral__front-near-front__halfbody__v001.png',
        to: '/academy/art/characters/angel/angel__neutral-long-dark-hair-project-notebook__front-near-front__fullbody__v002.webp',
        decision: 'delete',
        status: 'Onke identity-locked v002 family bound to runtime; generic glossy v001 stand-ins archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'francis-glasses-v001-to-illustrated-v002-family',
        character: 'francis',
        from: '/academy/art/characters/francis/francis__standardized-neutral__front-near-front__halfbody__v001.png',
        to: '/academy/art/characters/francis/francis__neutral-soft-sand-hair-manga-volume__front-near-front__fullbody__v002.webp',
        decision: 'delete',
        status: 'Francis identity-locked v002 family bound to runtime; glasses-on v001 stand-ins archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'robert-elderly-v001-to-illustrated-v002-family',
        character: 'robert',
        from: '/academy/art/characters/robert/robert__standardized-neutral__front-near-front__halfbody__v001.png',
        to: '/academy/art/characters/robert/robert__neutral-side-part-brown-square-glasses-folded-plan__front-near-front__fullbody__v002.webp',
        decision: 'delete',
        status: 'Robert identity-locked v002 family bound to runtime; elderly round-glasses v001 stand-ins archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'shin-glasses-free-v001-to-round-glasses-v002-family',
        character: 'shin',
        from: '/academy/art/characters/shin/shin__standardized-neutral__front-near-front__halfbody__v001.png',
        to: '/academy/art/characters/shin/shin__neutral-short-black-round-glasses-kanji-notebook__front-near-front__fullbody__v002.webp',
        decision: 'delete',
        status: 'Shin identity-locked v002 family bound to runtime; glasses-free partial v001 stand-ins archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'ruparna-cropped-v002-to-fullbody-v003-family',
        character: 'ruparna',
        from: '/academy/art/characters/ruparna/ruparna__neutral__front-near-front__halfbody__v002.png',
        to: '/academy/art/characters/ruparna/ruparna__neutral-long-dark-hair-subtitle-strips__front-near-front__fullbody__v003.webp',
        decision: 'delete',
        status: 'Ruparna identity-locked full-body v003 family bound to runtime; partial v002 sprites archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'stasi-partial-v001-to-illustrated-v002-family',
        character: 'stasi',
        from: '/academy/art/characters/stasi/stasi__standardized-neutral__front-near-front__halfbody__v001.png',
        to: '/academy/art/characters/stasi/stasi__neutral-auburn-waves-round-glasses__front-near-front__fullbody__v002.webp',
        decision: 'delete',
        status: 'Stasi identity-locked full-body v002 family bound to runtime; partial v001 sprites archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'felix-partial-v001-to-illustrated-v002-family',
        character: 'felix',
        from: '/academy/art/characters/felix/felix__neutral__halfbody__v001.png',
        to: '/academy/art/characters/felix/felix__neutral-curly-dark-blond-glasses-paper-cat__front-near-front__fullbody__v002.webp',
        decision: 'delete',
        status: 'Felix identity-locked full-body v002 family bound to runtime; mixed-angle partial v001 sprites archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'shaun-partial-v001-to-illustrated-v002-family',
        character: 'shaun',
        from: '/academy/art/characters/shaun/shaun__neutral__halfbody__v001.png',
        to: '/academy/art/characters/shaun/shaun__neutral-layered-light-brown-round-glasses-beige-fleece__front-near-front__fullbody__v002.webp',
        decision: 'delete',
        status: 'Shaun identity-locked full-body v002 family bound to runtime; partial v001 sprites archived outside runtime.',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'rie-neutral-to-glasses-primary',
        character: 'rie',
        from: '/academy/art/characters/rie/rie__neutral__halfbody__v001.png',
        to: '/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.webp',
        decision: 'delete',
        status: 'glasses-primary-bound; deprecated raster removed after zero-runtime-reference scan',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'rie-determined-to-glasses-primary',
        character: 'rie',
        from: '/academy/art/characters/rie/rie__determined__left-three-quarter__halfbody__v001.png',
        to: '/academy/art/characters/rie/rie__determined-glasses__left-three-quarter__halfbody__v001.webp',
        decision: 'delete',
        status: 'glasses-primary-bound; deprecated raster removed after zero-runtime-reference scan',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'rie-happy-to-glasses-primary',
        character: 'rie',
        from: '/academy/art/characters/rie/rie__happy__halfbody__v001.png',
        to: '/academy/art/characters/rie/rie__happy-glasses__front-near-front__halfbody__v001.webp',
        decision: 'delete',
        status: 'deprecated glasses-off raster removed; approved glasses-on performance bound',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'rie-encouraging-to-glasses-primary',
        character: 'rie',
        from: '/academy/art/characters/rie/rie__encouraging__halfbody__v001.png',
        to: '/academy/art/characters/rie/rie__encouraging-glasses__right-three-quarter__halfbody__v001.webp',
        decision: 'delete',
        status: 'deprecated glasses-off raster removed; approved glasses-on performance bound',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'rie-repair-to-vulnerable-glasses-primary',
        character: 'rie',
        from: '/academy/art/characters/rie/rie__repair__halfbody__v001.png',
        to: '/academy/art/characters/rie/rie__sad-vulnerable-glasses__left-three-quarter__halfbody__v001.webp',
        decision: 'delete',
        status: 'deprecated off-matrix repair raster removed; approved compassionate repair performance bound',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'rie-sad-vulnerable-to-glasses-primary',
        character: 'rie',
        from: '/academy/art/characters/rie/rie__sad-vulnerable__front-near-front__halfbody__v001.png',
        to: '/academy/art/characters/rie/rie__sad-vulnerable-glasses__left-three-quarter__halfbody__v001.webp',
        decision: 'delete',
        status: 'deprecated glasses-off raster removed; approved glasses-on performance bound',
        runtimeReferencesAfterMigration: [],
    }, {
        id: 'rie-comedic-to-glasses-primary',
        character: 'rie',
        from: '/academy/art/characters/rie/rie__comedic__right-three-quarter__halfbody__v001.png',
        to: '/academy/art/characters/rie/rie__comedic-glasses__right-three-quarter__halfbody__v001.webp',
        decision: 'delete',
        status: 'deprecated glasses-off raster removed; approved glasses-on performance bound',
        runtimeReferencesAfterMigration: [],
    }],
    characters,
    historicalAssets,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${path.relative(ROOT, OUTPUT)}: ${characters.length} characters, ${output.target.totalSlots} slots, ${historicalAssets.length} historical hashes.`);
