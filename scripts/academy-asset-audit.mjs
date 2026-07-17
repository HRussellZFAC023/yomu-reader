#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ART_ROOT = path.join(REPO_ROOT, 'public/academy/art');
const USAGE_PATH = path.join(PUBLIC_ART_ROOT, 'ASSET-USAGE.json');
const SPRITE_INVENTORY_PATH = path.join(PUBLIC_ART_ROOT, 'CLASSMATE-SPRITE-INVENTORY.json');
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

function deprecatedRecords(usage, spriteInventory) {
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
                present: fs.existsSync(path.join(REPO_ROOT, 'public', delivery.path.replace(/^\//, ''))),
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
            present: fs.existsSync(path.join(REPO_ROOT, 'public', migration.from.replace(/^\//, ''))),
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

export function buildAcademyAssetInventory() {
    const usage = readJson(USAGE_PATH);
    const spriteInventory = readJson(SPRITE_INVENTORY_PATH);
    const byDelivery = deliveryMap(usage);
    const deprecated = deprecatedRecords(usage, spriteInventory);
    const deprecatedPaths = new Set(deprecated.map(entry => entry.path));
    const active = [];
    const orphaned = [];

    for (const file of walk(PUBLIC_ART_ROOT).filter(file => RASTER_EXTENSIONS.has(path.extname(file).toLowerCase()))) {
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

    return {
        schemaVersion: 1,
        snapshotDate: SNAPSHOT_DATE,
        purpose: 'Canonical audit of current Academy sprites and scene rasters, explicit deprecations, and missing cast expression variants.',
        authority: {
            runtimeAuthorization: 'public/academy/art/ASSET-USAGE.json',
            expressionMatrix: 'public/academy/art/CLASSMATE-SPRITE-INVENTORY.json',
            physicalScope: 'public/academy/art/**/*.{jpeg,jpg,png,webp}',
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

    const physicalPaths = walk(PUBLIC_ART_ROOT)
        .filter(file => RASTER_EXTENSIONS.has(path.extname(file).toLowerCase()))
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
        if (fs.existsSync(path.join(REPO_ROOT, 'public', entry.plannedPath.replace(/^\//, '')))) {
            errors.push(`${entry.plannedPath}: marked missing but a raster exists.`);
        }
    }
    if (!inventory.noFilesDeletedByAudit || deprecated.some(entry => !entry.noDeletionPerformedByAudit)) {
        errors.push('The inventory does not preserve its no-deletion guarantee.');
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
