#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ART_ROOT = path.join(REPO_ROOT, 'public/academy/art');
const USAGE_PATH = path.join(PUBLIC_ART_ROOT, 'ASSET-USAGE.json');
const SPRITE_INVENTORY_PATH = path.join(PUBLIC_ART_ROOT, 'CLASSMATE-SPRITE-INVENTORY.json');
const LESSON_ONE_PATH = path.join(REPO_ROOT, 'public/academy/content/lessons/002-l1-l01.json');
const CLASS_WEEK_CAST_PATH = path.join(REPO_ROOT, 'public/academy/content/curriculum/class-week-cast.v1.json');
export const OUTPUT_PATH = path.join(REPO_ROOT, 'docs/academy/recovery/ASSET-INVENTORY.json');

const SNAPSHOT_DATE = '2026-07-17';
const RASTER_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);

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

function trackedRasterFiles() {
    const paths = execFileSync('git', ['ls-files', '-z', '--', 'public/academy/art'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    }).split('\0').filter(Boolean);
    return paths
        .filter(file => RASTER_EXTENSIONS.has(path.extname(file).toLowerCase()))
        .map(file => path.join(REPO_ROOT, file))
        .filter(file => fs.existsSync(file));
}

function publicPath(file) {
    return `/${path.relative(path.join(REPO_ROOT, 'public'), file).split(path.sep).join('/')}`;
}

function rasterKind(assetPath) {
    if (assetPath.includes('/characters/')) return 'character-sprite';
    if (assetPath.includes('/protagonists/')) return 'protagonist-portrait';
    if (assetPath.includes('/locations/')) return 'scene-background';
    if (assetPath.includes('/events/')) return 'scene-event';
    if (assetPath.includes('/items/')) return 'scene-item';
    return 'unclassified-raster';
}

function isRuntimeVerdict(verdict) {
    return verdict?.startsWith('approved-runtime') || verdict === 'review-candidate/runtime-preview';
}

function isDeprecatedVerdict(verdict) {
    return verdict?.startsWith('rejected');
}

function sortByPath(entries) {
    return entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function countByKind(entries) {
    return Object.fromEntries([...new Set(entries.map(entry => entry.kind))]
        .sort((a, b) => a.localeCompare(b, 'en'))
        .map(kind => [kind, entries.filter(entry => entry.kind === kind).length]));
}

function deliveryMap(usage) {
    const result = new Map();
    for (const asset of usage.assets) {
        for (const delivery of asset.deliveries ?? []) {
            if (!RASTER_EXTENSIONS.has(path.extname(delivery.path).toLowerCase())) continue;
            if (result.has(delivery.path)) throw new TypeError(`Duplicate ASSET-USAGE delivery: ${delivery.path}`);
            result.set(delivery.path, { asset, delivery });
        }
    }
    return result;
}

function currentRecord(assetPath, file, ledger) {
    const { asset, delivery } = ledger ?? {};
    const runtimeHomes = [...(asset?.runtimeHome ?? [])];
    const reviewHomes = [...(asset?.reviewHome ?? [])];
    const runtimeAuthorized = Boolean(asset && isRuntimeVerdict(asset.verdict) && runtimeHomes.length > 0);
    return {
        id: asset?.id ?? `unregistered:${assetPath}`,
        path: assetPath,
        sha256: sha256(file),
        ledgerSha256: delivery?.sha256 ?? null,
        kind: rasterKind(assetPath),
        state: runtimeAuthorized ? 'active' : 'orphaned',
        present: true,
        runtimeAuthorized,
        runtimeHomes,
        reviewHomes,
        sourceLedger: 'public/academy/art/ASSET-USAGE.json',
        ledgerVerdict: asset?.verdict ?? 'unregistered',
        ledgerStatus: asset?.status ?? 'No ASSET-USAGE entry exists for this raster.',
    };
}

function deprecatedRecords(usage, spriteInventory, trackedPaths) {
    const records = [];
    for (const asset of usage.assets.filter(entry => isDeprecatedVerdict(entry.verdict))) {
        for (const delivery of asset.deliveries ?? []) {
            if (!RASTER_EXTENSIONS.has(path.extname(delivery.path).toLowerCase())) continue;
            records.push({
                id: asset.id,
                path: delivery.path,
                sha256: delivery.sha256,
                kind: rasterKind(delivery.path),
                state: 'deprecated',
                present: trackedPaths.has(delivery.path),
                runtimeAuthorized: false,
                runtimeHomes: [],
                reviewHomes: [...(asset.reviewHome ?? [])],
                replacementPath: null,
                sourceLedger: 'public/academy/art/ASSET-USAGE.json',
                ledgerVerdict: asset.verdict,
                ledgerStatus: asset.status,
                noDeletionPerformedByAudit: true,
            });
        }
    }
    for (const migration of spriteInventory.migrations.filter(entry => entry.decision === 'delete')) {
        if (records.some(record => record.path === migration.from)) continue;
        records.push({
            id: migration.id,
            path: migration.from,
            sha256: null,
            kind: rasterKind(migration.from),
            state: 'deprecated',
            present: trackedPaths.has(migration.from),
            runtimeAuthorized: false,
            runtimeHomes: [...migration.runtimeReferencesAfterMigration],
            reviewHomes: [],
            replacementPath: migration.to,
            sourceLedger: 'public/academy/art/CLASSMATE-SPRITE-INVENTORY.json',
            ledgerVerdict: migration.decision,
            ledgerStatus: migration.status,
            noDeletionPerformedByAudit: true,
        });
    }
    return sortByPath(records);
}

function missingExpressionVariants(spriteInventory) {
    return spriteInventory.characters
        .flatMap(character => character.missingVariants.map(variant => ({
            character: character.id,
            angle: variant.angle,
            expression: variant.expression,
            plannedPath: variant.plannedPath,
            state: 'missing-expression-variant',
            present: false,
            sourceLedger: 'public/academy/art/CLASSMATE-SPRITE-INVENTORY.json',
        })))
        .sort((a, b) => [a.character, a.angle, a.expression].join(':')
            .localeCompare([b.character, b.angle, b.expression].join(':'), 'en'));
}

function offMatrixSprites(spriteInventory, stateByPath) {
    return spriteInventory.characters
        .flatMap(character => character.currentAssets
            .filter(asset => asset.coverageStatus === 'off-matrix')
            .map(asset => ({
                character: character.id,
                path: asset.path,
                sha256: asset.sha256,
                currentState: stateByPath.get(asset.path) ?? 'unaccounted',
                coverageStatus: asset.coverageStatus,
                migrationStatus: asset.migrationStatus,
                countsTowardExpressionMatrix: false,
            })))
        .sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function lessonAssetBindings(usage) {
    const lesson = readJson(LESSON_ONE_PATH);
    const castPlan = readJson(CLASS_WEEK_CAST_PATH).weeks.find(week => week.weekId === lesson.id);
    const binding = usage.lessonBindings?.find(entry => entry.packageId === lesson.id);
    if (!binding || !castPlan) throw new TypeError(`${lesson.id}: asset binding or class-week cast plan is missing.`);

    const assetsById = new Map(usage.assets.map(asset => [asset.id, asset]));
    const requiredCast = [...new Set([
        ...lesson.scene.cast,
        castPlan.primary.id,
        ...castPlan.supporting.map(member => member.id),
    ])];
    const approvedCast = Object.fromEntries(Object.entries(binding.approvedCastAssetIds).map(([castId, assetId]) => {
        const asset = assetsById.get(assetId);
        return [castId, { assetId, verdict: asset?.verdict ?? 'missing-ledger-entry', deliveries: asset?.deliveries ?? [] }];
    }));
    const reviewOnlyCast = Object.fromEntries(Object.entries(binding.reviewOnlyCastCandidates).map(([castId, assetId]) => {
        const asset = assetsById.get(assetId);
        return [castId, { assetId, verdict: asset?.verdict ?? 'missing-ledger-entry', deliveries: asset?.deliveries ?? [] }];
    }));
    const reconciledCast = new Set([...Object.keys(approvedCast), ...Object.keys(reviewOnlyCast)]);
    const sourceReferenceFile = path.join(REPO_ROOT, 'public', lesson.scene.sceneImage.replace(/^\//u, ''));

    return [{
        packageId: lesson.id,
        sourceSceneReference: lesson.scene.sceneImage,
        sourceSceneReferenceState: fs.existsSync(sourceReferenceFile)
            ? 'present-source-reference'
            : 'missing-source-reference-with-approved-registry-binding',
        approvedScene: {
            assetId: binding.sceneAssetId,
            verdict: assetsById.get(binding.sceneAssetId)?.verdict ?? 'missing-ledger-entry',
            deliveries: assetsById.get(binding.sceneAssetId)?.deliveries ?? [],
        },
        requiredCastSources: {
            lessonScene: lesson.scene.cast,
            storyContinuity: [castPlan.primary.id, ...castPlan.supporting.map(member => member.id)],
        },
        approvedCast,
        reviewOnlyCast,
        unboundNoApprovedAsset: requiredCast.filter(castId => !reconciledCast.has(castId)).sort(),
        items: binding.itemAssetIds.map(assetId => ({
            assetId,
            verdict: assetsById.get(assetId)?.verdict ?? 'missing-ledger-entry',
            deliveries: assetsById.get(assetId)?.deliveries ?? [],
        })),
        sourceMedia: binding.sourceMedia.map(media => {
            const publicFile = path.join(REPO_ROOT, 'public', media.path.replace(/^\//u, ''));
            const docsFile = path.join(REPO_ROOT, 'docs/public', media.path.replace(/^\/academy\//u, 'academy/'));
            return {
                ...media,
                present: fs.existsSync(publicFile),
                mirrored: fs.existsSync(docsFile),
                actualSha256: fs.existsSync(publicFile) ? sha256(publicFile) : null,
                mirrorSha256: fs.existsSync(docsFile) ? sha256(docsFile) : null,
            };
        }),
        placeholderPortraitsAuthorized: false,
    }];
}

export function buildAcademyAssetInventory() {
    const usage = readJson(USAGE_PATH);
    const spriteInventory = readJson(SPRITE_INVENTORY_PATH);
    const byDelivery = deliveryMap(usage);
    const currentFiles = trackedRasterFiles();
    const trackedPaths = new Set(currentFiles.map(publicPath));
    const deprecated = deprecatedRecords(usage, spriteInventory, trackedPaths);
    const deprecatedPaths = new Set(deprecated.map(entry => entry.path));
    const active = [];
    const orphaned = [];

    for (const file of currentFiles) {
        const assetPath = publicPath(file);
        if (deprecatedPaths.has(assetPath)) continue;
        const record = currentRecord(assetPath, file, byDelivery.get(assetPath));
        (record.state === 'active' ? active : orphaned).push(record);
    }
    sortByPath(active);
    sortByPath(orphaned);

    const missingVariants = missingExpressionVariants(spriteInventory);
    const stateByPath = new Map([
        ...active.map(entry => [entry.path, entry.state]),
        ...orphaned.map(entry => [entry.path, entry.state]),
        ...deprecated.map(entry => [entry.path, entry.state]),
    ]);
    const offMatrixDelivered = offMatrixSprites(spriteInventory, stateByPath);
    const deprecatedPresent = deprecated.filter(entry => entry.present).length;

    const lessonBindings = lessonAssetBindings(usage);

    return {
        schemaVersion: 1,
        snapshotDate: SNAPSHOT_DATE,
        purpose: 'Canonical audit of current Academy sprites and scene rasters, explicit deprecations, and missing cast expression variants.',
        authority: {
            runtimeAuthorization: 'public/academy/art/ASSET-USAGE.json',
            expressionMatrix: 'public/academy/art/CLASSMATE-SPRITE-INVENTORY.json',
            physicalScope: 'git-tracked public/academy/art/**/*.{jpeg,jpg,png,webp}',
            recoveredReviewScope: 'public/academy/art/ASSET-USAGE.json#recovered-art-review-collection-v1',
            physicalPresenceDoesNotAuthorizeRuntime: true,
            recoveryArchivesAuthorizeRuntime: false,
        },
        policy: {
            active: 'Present raster with an approved-runtime or review-candidate/runtime-preview ASSET-USAGE verdict and at least one runtime home.',
            orphaned: 'Present, non-deprecated raster without runtime authorization; retained for review and never silently promoted.',
            deprecated: 'Explicitly rejected or superseded raster; it may be absent and is never runtime-authorized.',
            missingExpressionVariant: 'Undelivered slot in the canonical 28-character by 3-angle by 7-expression matrix.',
            offMatrix: 'Delivered sprite outside the canonical expression matrix; retained state is reported but it does not fill a matrix slot.',
            deletion: 'This audit never deletes, moves, or mutates Academy raster files.',
        },
        counts: {
            currentRasterFiles: active.length + orphaned.length + deprecatedPresent,
            currentRasterFilesAccountedFor: active.length + orphaned.length + deprecatedPresent,
            active: active.length,
            orphaned: orphaned.length,
            deprecated: deprecated.length,
            deprecatedPresent,
            missingExpressionVariants: missingVariants.length,
            expressionMatrixSlots: spriteInventory.target.totalSlots,
            approvedExpressionVariants: spriteInventory.summary.approved,
            reviewCandidateExpressionVariants: spriteInventory.summary.reviewCandidates,
            deliveredMatrixExpressionVariants: spriteInventory.summary.approved + spriteInventory.summary.reviewCandidates,
            offMatrixDeliveredSprites: offMatrixDelivered.length,
            activeByKind: countByKind(active),
            orphanedByKind: countByKind(orphaned),
            deprecatedByKind: countByKind(deprecated),
        },
        assets: { active, orphaned, deprecated },
        expressionCoverage: {
            target: spriteInventory.target,
            offMatrixDelivered,
            missingVariants,
        },
        lessonBindings,
        noFilesDeletedByAudit: true,
    };
}

export function serializeAcademyAssetInventory(inventory = buildAcademyAssetInventory()) {
    return `${JSON.stringify(inventory, null, 2)}\n`;
}

export function validateAcademyAssetInventory(inventory) {
    const errors = [];
    const expected = buildAcademyAssetInventory();
    if (JSON.stringify(inventory) !== JSON.stringify(expected)) errors.push('ASSET-INVENTORY.json does not match the canonical source-derived inventory.');

    const { active, orphaned, deprecated } = inventory.assets;
    const present = [...active, ...orphaned, ...deprecated.filter(entry => entry.present)];
    const presentPaths = present.map(entry => entry.path);
    if (new Set(presentPaths).size !== presentPaths.length) errors.push('Present asset states overlap or contain duplicate paths.');

    const physicalPaths = trackedRasterFiles()
        .map(publicPath)
        .sort((a, b) => a.localeCompare(b, 'en'));
    if (JSON.stringify([...presentPaths].sort((a, b) => a.localeCompare(b, 'en'))) !== JSON.stringify(physicalPaths)) {
        errors.push('Present public Academy rasters are not accounted for exactly once.');
    }
    for (const entry of [...active, ...orphaned]) {
        const file = path.join(REPO_ROOT, 'public', entry.path.replace(/^\//, ''));
        if (!fs.existsSync(file)) errors.push(`${entry.path}: current asset is missing.`);
        else if (sha256(file) !== entry.sha256 || (entry.ledgerSha256 && entry.ledgerSha256 !== entry.sha256)) {
            errors.push(`${entry.path}: SHA-256 drifted from the inventory or source ledger.`);
        }
    }
    for (const entry of active) {
        if (!entry.runtimeAuthorized || !entry.runtimeHomes.length) errors.push(`${entry.path}: active asset lacks runtime authorization.`);
    }
    for (const entry of [...orphaned, ...deprecated]) {
        if (entry.runtimeAuthorized || entry.runtimeHomes.length) errors.push(`${entry.path}: ${entry.state} asset claims a runtime home.`);
    }

    const missing = inventory.expressionCoverage.missingVariants;
    const plannedPaths = missing.map(entry => entry.plannedPath);
    if (new Set(plannedPaths).size !== plannedPaths.length) errors.push('Missing expression variants contain duplicate planned paths.');
    if (missing.length + inventory.counts.deliveredMatrixExpressionVariants !== inventory.counts.expressionMatrixSlots) {
        errors.push('Expression matrix delivered and missing counts do not reconcile.');
    }
    for (const entry of missing) {
        if (physicalPaths.includes(entry.plannedPath)) {
            errors.push(`${entry.plannedPath}: marked missing but a release-tracked raster exists.`);
        }
    }
    if (!inventory.noFilesDeletedByAudit || deprecated.some(entry => !entry.noDeletionPerformedByAudit)) {
        errors.push('The inventory does not preserve its no-deletion guarantee.');
    }
    for (const binding of inventory.lessonBindings ?? []) {
        if (binding.approvedScene.verdict !== 'approved-runtime') {
            errors.push(`${binding.packageId}: scene binding is not approved-runtime.`);
        }
        for (const [castId, asset] of Object.entries(binding.approvedCast)) {
            if (asset.verdict !== 'approved-runtime') errors.push(`${binding.packageId}:${castId}: approved cast binding is not approved-runtime.`);
        }
        for (const [castId, asset] of Object.entries(binding.reviewOnlyCast)) {
            if (!asset.verdict.includes('preview')) errors.push(`${binding.packageId}:${castId}: review-only cast candidate is not preview-gated.`);
        }
        const requiredCast = new Set([...binding.requiredCastSources.lessonScene, ...binding.requiredCastSources.storyContinuity]);
        const reconciledCast = new Set([...Object.keys(binding.approvedCast), ...Object.keys(binding.reviewOnlyCast), ...binding.unboundNoApprovedAsset]);
        if (JSON.stringify([...requiredCast].sort()) !== JSON.stringify([...reconciledCast].sort())) {
            errors.push(`${binding.packageId}: required cast does not reconcile across approved, review-only, and unbound states.`);
        }
        if (binding.placeholderPortraitsAuthorized) errors.push(`${binding.packageId}: placeholder portraits must not be authorized.`);
        for (const media of binding.sourceMedia) {
            if (!media.present || !media.mirrored || media.actualSha256 !== media.sha256 || media.mirrorSha256 !== media.sha256) {
                errors.push(`${binding.packageId}:${media.path}: source media is missing, unmirrored, or hash-drifted.`);
            }
        }
    }
    return errors;
}

function run() {
    const command = process.argv[2] ?? 'validate';
    if (!['build', 'validate'].includes(command)) {
        console.error('Usage: node scripts/academy-asset-audit.mjs [build|validate]');
        process.exitCode = 2;
        return;
    }
    if (command === 'build') {
        fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
        fs.writeFileSync(OUTPUT_PATH, serializeAcademyAssetInventory());
        console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}.`);
    }
    if (!fs.existsSync(OUTPUT_PATH)) {
        console.error(`Missing ${path.relative(REPO_ROOT, OUTPUT_PATH)}; run build first.`);
        process.exitCode = 1;
        return;
    }
    const inventory = readJson(OUTPUT_PATH);
    const errors = validateAcademyAssetInventory(inventory);
    if (errors.length) {
        for (const error of errors) console.error(`- ${error}`);
        process.exitCode = 1;
        return;
    }
    console.log(`Validated ${path.relative(REPO_ROOT, OUTPUT_PATH)}: ${inventory.counts.active} active, ${inventory.counts.orphaned} orphaned, ${inventory.counts.deprecated} deprecated, ${inventory.counts.missingExpressionVariants} missing expression variants.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
